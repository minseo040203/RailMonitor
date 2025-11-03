# [수정] app_unified.py (YOLO 신뢰도 임계값(conf) 조절 기능 추가)

# --- 1. 필요한 모든 라이브러리 임포트 ---
import cv2
from ultralytics import YOLO
import os
import time
from typing import Dict, Tuple, List
import numpy as np
from flask import Flask, jsonify, Response, send_from_directory
from flask_cors import CORS
import threading

# --- 2. 전역 변수 및 스레드 동기화를 위한 Lock (144석 스케일) ---
app_state = {
    "restroom_queue_count": 0,
    "seating_occupied_count": 0,
    "seating_total_seats": 144,
    "seating_available_seats": 144
}
output_frame_restroom = None
output_frame_seating = None
lock = threading.Lock()

# --------------------------------------------------------------------------
# --- 3. 화장실 대기열 분석 함수 (conf 추가) ---
# --------------------------------------------------------------------------
def run_restroom_analysis():
    global output_frame_restroom, app_state
    VIDEO_FILE = "toilet_line.mp4"
    MODEL_NAME = 'yolov8s.pt'
    
    # ▼▼▼ [신규] YOLO 신뢰도 임계값 (0.2 = 20%) ▼▼▼
    # 이 값을 낮추면(예: 0.15) 뭉개진 사람도 더 잘 탐지합니다.
    CONF_THRESHOLD = 0.3
    # ▲▲▲ [신규] ▲▲▲
    
    MIN_WAIT_TIME_SECONDS = 1.0
    TARGET_FPS_ANALYSIS = 1.0
    MAX_MISS_CYCLES = 2

    cap = cv2.VideoCapture(VIDEO_FILE)
    if not cap.isOpened():
        print(f"오류: 화장실 동영상 파일을 열 수 없습니다: {VIDEO_FILE}")
        return

    original_fps = cap.get(cv2.CAP_PROP_FPS)
    if original_fps <= 0: original_fps = 30.0
    delay_per_frame_sec = 1.0 / original_fps

    ROI_POLYGON = np.array([[474, 297], [444, 790], [1014, 1075], [1917, 1074], [1915, 352]], np.int32)
    print("화장실 분석기: 고정된 ROI로 분석을 시작합니다.")

    detector = YOLO(MODEL_NAME)

    if original_fps > 0 and TARGET_FPS_ANALYSIS > 0: FRAME_SKIP = max(1, round(original_fps / TARGET_FPS_ANALYSIS))
    else: FRAME_SKIP = 30
    
    print(f"화장실 분석기 FPS: {original_fps:.2f}. 분석 주기: {FRAME_SKIP} 프레임마다 1회")

    person_wait_times: Dict[int, float] = {}
    person_miss_count: Dict[int, int] = {}
    last_analysis_data: Dict[int, Tuple[Tuple[int, int, int, int], str]] = {}
    frame_count = 0
    
    while True:
        loop_start_time = time.time() 

        ret, frame = cap.read()
        if not ret:
            print("화장실 영상이 끝났습니다. 처음부터 다시 시작합니다.")
            cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
            continue

        current_time = time.time()
        frame_count += 1
        annotated_frame = frame.copy()
        perform_analysis = (frame_count % FRAME_SKIP == 0)

        if perform_analysis:
            # ▼▼▼ [수정] conf=CONF_THRESHOLD 파라미터 추가 ▼▼▼
            results = detector.track(frame, persist=True, classes=[0], tracker="bytetrack.yaml", verbose=False, conf=CONF_THRESHOLD)
            # ▲▲▲ [수정] ▲▲▲
            
            current_track_ids = set()
            new_analysis_data: Dict[int, Tuple[Tuple[int, int, int, int], str]] = {}

            if results and results[0].boxes and results[0].boxes.id is not None:
                boxes = results[0].boxes.xyxy.cpu().numpy()
                track_ids = results[0].boxes.id.cpu().numpy().astype(int)

                for box, id in zip(boxes, track_ids):
                    x1, y1, x2, y2 = map(int, box)
                    center_x, center_y = (x1 + x2) / 2, (y1 + y2) / 2
                    current_track_ids.add(id)
                    person_miss_count[id] = 0
                    is_in_roi = cv2.pointPolygonTest(ROI_POLYGON, (center_x, center_y), False) >= 0
                    
                    status = "Passing by"
                    if is_in_roi:
                        if id not in person_wait_times: person_wait_times[id] = current_time
                        time_spent = current_time - person_wait_times[id]
                        status = "In Queue" if time_spent >= MIN_WAIT_TIME_SECONDS else f"Entering ({time_spent:.1f}s)"
                    else:
                        person_wait_times.pop(id, None)
                    new_analysis_data[id] = ((x1, y1, x2, y2), status)

                ids_to_check = list(person_wait_times.keys() - current_track_ids)
                ids_to_remove = []
                for id in ids_to_check:
                    person_miss_count[id] = person_miss_count.get(id, 0) + 1
                    if person_miss_count[id] > MAX_MISS_CYCLES: ids_to_remove.append(id)
                    elif id in last_analysis_data: new_analysis_data[id] = last_analysis_data[id]
                
                for id in ids_to_remove:
                    person_wait_times.pop(id, None)
                    person_miss_count.pop(id, None)

            last_analysis_data = new_analysis_data
            
            queue_count = sum(1 for _, status in last_analysis_data.values() if "In Queue" in status)
            
            with lock:
                app_state["restroom_queue_count"] = queue_count

        for id, (box, status) in last_analysis_data.items():
            x1, y1, x2, y2 = box
            color = (0, 255, 0) if "In Queue" in status else (0, 255, 255) if "Entering" in status else (128, 128, 128)
            cv2.rectangle(annotated_frame, (x1, y1), (x2, y2), color, 2)
            cv2.putText(annotated_frame, f"ID {id} | {status}", (x1, y1 - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)

        cv2.polylines(annotated_frame, [ROI_POLYGON], isClosed=True, color=(255, 0, 0), thickness=2)
        
        with lock:
            text_to_show = f"QUEUE: {app_state['restroom_queue_count']}"
            (text_width, text_height), _ = cv2.getTextSize(text_to_show, cv2.FONT_HERSHEY_SIMPLEX, 1, 2)
            cv2.putText(annotated_frame, text_to_show, (frame.shape[1] - text_width - 10, 30),
                        cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 0, 0), 2, cv2.LINE_AA)
            global output_frame_restroom
            output_frame_restroom = annotated_frame.copy()

        processing_time_sec = time.time() - loop_start_time
        wait_time_sec = delay_per_frame_sec - processing_time_sec
        if wait_time_sec > 0:
            time.sleep(wait_time_sec)

    cap.release()
    cv2.destroyAllWindows()


# --------------------------------------------------------------------------
# --- 4. 좌석 점유 분석 함수 (conf 추가) ---
# --------------------------------------------------------------------------
def run_seating_analysis():
    global app_state, output_frame_seating 

    VIDEO_FILE = "ai좌석영상.mp4" 
    ACTUAL_TOTAL_SEATS = 144
    YOLO_VISIBLE_SEATS = 36
    ROI_POLYGON = np.array([[1402, 439], [786, 781], [1251, 1051], [1449, 1051], [1821, 570]], np.int32)
    MODEL_NAME = 'yolov8s.pt'
    
    # ▼▼▼ [신규] YOLO 신뢰도 임계값 (0.2 = 20%) ▼▼▼
    # 이 값을 낮추면(예: 0.15) 뭉개진 사람도 더 잘 탐지합니다.
    CONF_THRESHOLD = 0.2
    # ▲▲▲ [신규] ▲▲▲
    
    TARGET_FPS_ANALYSIS = 1.0
    MIN_WAIT_TIME_SECONDS = 3.0
    MAX_MISS_CYCLES = 10

    detector = YOLO(MODEL_NAME)
    cap = cv2.VideoCapture(VIDEO_FILE)
    if not cap.isOpened():
        print(f"오류: 좌석 동영상 파일을 열 수 없습니다: {VIDEO_FILE}")
        return

    original_fps_float = cap.get(cv2.CAP_PROP_FPS)
    if original_fps_float <= 0: original_fps_float = 30.0
    delay_per_frame_sec = 1.0 / original_fps_float

    FRAME_SKIP = max(1, round(original_fps_float / TARGET_FPS_ANALYSIS))
    print(f"좌석 분석기 FPS: {original_fps_float:.2f}. 분석 주기: {FRAME_SKIP} 프레임마다 1회")
    
    person_entry_time: Dict[int, float] = {}
    person_miss_count: Dict[int, int] = {}
    last_analysis_data: Dict[int, Tuple[Tuple[int, int, int, int], str]] = {}
    frame_count = 0

    while True:
        loop_start_time = time.time()
        
        ret, frame = cap.read()
        if not ret:
            print("좌석 영상이 끝났습니다. 처음부터 다시 시작합니다.")
            cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
            continue
        
        annotated_frame = frame.copy() 
        current_time = time.time()
        frame_count += 1
        perform_analysis = (frame_count % FRAME_SKIP == 0)
        
        yolo_occupied_count = 0

        if perform_analysis:
            # ▼▼▼ [수정] conf=CONF_THRESHOLD 파라미터 추가 ▼▼▼
            results = detector.track(frame, persist=True, classes=[0], tracker="bytetrack.yaml", verbose=False, conf=CONF_THRESHOLD)
            # ▲▲▲ [수정] ▲▲▲

            current_track_ids = set()
            new_analysis_data: Dict[int, Tuple[Tuple[int, int, int, int], str]] = {}
            waiting_count_this_cycle = 0

            if results and results[0].boxes and results[0].boxes.id is not None:
                boxes = results[0].boxes.xyxy.cpu().numpy()
                track_ids = results[0].boxes.id.cpu().numpy().astype(int)

                for box, id in zip(boxes, track_ids):
                    x1, y1, x2, y2 = map(int, box)
                    center_x, bottom_y = (x1 + x2) / 2, y2
                    current_track_ids.add(id)
                    person_miss_count[id] = 0
                    is_in_roi = cv2.pointPolygonTest(ROI_POLYGON, (int(center_x), int(bottom_y)), False) >= 0
                    
                    status = "Passing"
                    if is_in_roi:
                        if id not in person_entry_time: person_entry_time[id] = current_time
                        time_waiting = current_time - person_entry_time.get(id, current_time)
                        if time_waiting >= MIN_WAIT_TIME_SECONDS:
                            status = "WAITING"
                            waiting_count_this_cycle += 1
                        else:
                            status = f"Entering ({time_waiting:.1f}s)"
                    else:
                        person_entry_time.pop(id, None)
                    new_analysis_data[id] = ((x1, y1, x2, y2), status)

                ids_to_check = list(person_entry_time.keys() - current_track_ids)
                ids_to_remove = []
                for id in ids_to_check:
                    person_miss_count[id] = person_miss_count.get(id, 0) + 1
                    if person_miss_count[id] > MAX_MISS_CYCLES:
                        ids_to_remove.append(id)
                    elif id in last_analysis_data: 
                        new_analysis_data[id] = last_analysis_data[id] 

                for id in ids_to_remove:
                    person_entry_time.pop(id, None)
                    person_miss_count.pop(id, None)

            last_analysis_data = new_analysis_data
            
            yolo_occupied_count = waiting_count_this_cycle
            
            if YOLO_VISIBLE_SEATS > 0:
                occupancy_rate = yolo_occupied_count / float(YOLO_VISIBLE_SEATS)
            else:
                occupancy_rate = 0 
            
            estimated_total_occupied = int(ACTUAL_TOTAL_SEATS * occupancy_rate)
            available_seats = max(0, ACTUAL_TOTAL_SEATS - estimated_total_occupied)

            with lock:
                app_state["seating_occupied_count"] = estimated_total_occupied
                app_state["seating_available_seats"] = available_seats
                app_state["seating_total_seats"] = ACTUAL_TOTAL_SEATS
        
        cv2.polylines(annotated_frame, [ROI_POLYGON], isClosed=True, color=(255, 0, 0), thickness=3)

        for id, (box, status) in last_analysis_data.items():
            x1, y1, x2, y2 = box
            color = (0, 0, 255) if status == "WAITING" else (0, 165, 255) if "Entering" in status else (0, 255, 0)
            cv2.rectangle(annotated_frame, (x1, y1), (x2, y2), color, 2)
            cv2.putText(annotated_frame, f"ID {id} | {status}", (x1, y1 - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)
        
        with lock:
            text_sample = f"Sample: {yolo_occupied_count} / {YOLO_VISIBLE_SEATS}"
            text_total = f"Total (Est): {app_state['seating_occupied_count']} / {ACTUAL_TOTAL_SEATS}"
            
            cv2.putText(annotated_frame, text_sample, (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2, cv2.LINE_AA)
            cv2.putText(annotated_frame, text_total, (10, 70), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2, cv2.LINE_AA)
            output_frame_seating = annotated_frame.copy()
        
        processing_time_sec = time.time() - loop_start_time
        wait_time_sec = delay_per_frame_sec - processing_time_sec
        if wait_time_sec > 0:
            time.sleep(wait_time_sec)

    cap.release()


# --------------------------------------------------------------------------
# --- 5. Flask 웹 서버 설정 (기존과 100% 동일) ---
# --------------------------------------------------------------------------
app = Flask(__name__)
CORS(app)

@app.route('/')
def index(): return send_from_directory('.', 'index.html')
@app.route('/script.js')
def serve_script(): return send_from_directory('.', 'script.js')
@app.route('/style.css')
def serve_style(): return send_from_directory('.', 'style.css')

@app.route('/api/all_status')
def get_all_status():
    with lock:
        status_data = app_state.copy()
    return jsonify(status_data)

def generate_restroom_stream():
    global output_frame_restroom, lock
    while True:
        with lock:
            if output_frame_restroom is None: continue
            (flag, encodedImage) = cv2.imencode(".jpg", output_frame_restroom)
            if not flag: continue
        yield(b'--frame\r\n' b'Content-Type: image/jpeg\r\n\r\n' + bytearray(encodedImage) + b'\r\n')

@app.route('/video_feed_restroom')
def video_feed_restroom():
    return Response(generate_restroom_stream(), mimetype="multipart/x-mixed-replace; boundary=frame")

def generate_seating_stream():
    global output_frame_seating, lock
    while True:
        with lock:
            if output_frame_seating is None: continue
            (flag, encodedImage) = cv2.imencode(".jpg", output_frame_seating)
            if not flag: continue
        yield(b'--frame\r\n' b'Content-Type: image/jpeg\r\n\r\n' + bytearray(encodedImage) + b'\r\n')

@app.route('/video_feed_seating')
def video_feed_seating():
    return Response(generate_seating_stream(), mimetype="multipart/x-mixed-replace; boundary=frame")


# --------------------------------------------------------------------------
# --- 6. 메인 실행 블록 (기존과 100% 동일) ---
# --------------------------------------------------------------------------
if __name__ == '__main__':
    restroom_thread = threading.Thread(target=run_restroom_analysis, daemon=True)
    seating_thread = threading.Thread(target=run_seating_analysis, daemon=True)
    
    restroom_thread.start()
    seating_thread.start()
    
    print("Flask 서버를 시작합니다. http://0.0.0.0:5000 에서 접속 가능합니다.")
    app.run(host='0.0.0.0', port=5000, use_reloader=False)