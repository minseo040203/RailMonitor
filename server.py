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

# --- 2. 전역 변수 및 스레드 동기화를 위한 Lock ---
app_state = {
    "queue_count": 0
}
output_frame = None
lock = threading.Lock()

# --- 3. 영상 분석 함수 (사용자 제공 코드 기반) ---
def run_video_analysis():
    global output_frame, app_state

    # =============================================================
    # --- 사용자 제공 코드 시작 (로직 수정 없음) ---
    # =============================================================

    polygon_points: List[List[int]] = []
    def mouse_callback(event, x, y, flags, param):
        if event == cv2.EVENT_LBUTTONDOWN:
            polygon_points.append([x, y])
            cv2.circle(param['image'], (x, y), 5, (0, 255, 0), -1)
            if len(polygon_points) > 1:
                cv2.line(param['image'], tuple(polygon_points[-2]), tuple(polygon_points[-1]), (0, 255, 0), 2)
            cv2.imshow("Select Polygon ROI", param['image'])
            print(f"점 추가됨: ({x}, {y})")

    VIDEO_FILE = "toilet_line.mp4"
    MODEL_NAME = 'yolov8n.pt'
    MIN_WAIT_TIME_SECONDS = 1.0
    TARGET_FPS_ANALYSIS = 1.0
    MAX_MISS_CYCLES = 2

    cap = cv2.VideoCapture(VIDEO_FILE)
    if not cap.isOpened():
        print(f"오류: 동영상 파일을 열 수 없습니다: {VIDEO_FILE}")
        return

    ret, first_frame = cap.read()
    if not ret:
        print("오류: 동영상에서 프레임을 읽을 수 없습니다.")
        cap.release()
        return

    clone = first_frame.copy()
    cv2.namedWindow("Select Polygon ROI")
    cv2.setMouseCallback("Select Polygon ROI", mouse_callback, {'image': first_frame})

    print("--- 다각형 ROI 설정 안내 ---")
    print("1. 원하는 지점을 마우스로 순서대로 클릭하여 다각형을 그리세요.")
    print("2. 완료되면 'c' 키를 눌러 분석을 시작합니다.")
    print("3. 리셋하려면 'r' 키를 누르세요.")

    while True:
        cv2.imshow("Select Polygon ROI", first_frame)
        key = cv2.waitKey(1) & 0xFF
        if key == ord('r'):
            first_frame = clone.copy()
            polygon_points = []
            print("리셋되었습니다. 다시 클릭하세요.")
        elif key == ord('c'):
            if len(polygon_points) < 3:
                print("오류: 최소 3개 이상의 점을 클릭해야 합니다.")
            else:
                break

    cv2.destroyAllWindows()
    ROI_POLYGON = np.array(polygon_points, np.int32)
    print("다각형 ROI 설정 완료. 분석을 시작합니다...")

    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
    output_dir = "output_polygon_queue"
    os.makedirs(output_dir, exist_ok=True)
    output_path = os.path.join(output_dir, "polygon_queue_result_video.mp4")
    detector = YOLO(MODEL_NAME)

    frame_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    frame_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    original_fps = cap.get(cv2.CAP_PROP_FPS)

    if original_fps > 0 and TARGET_FPS_ANALYSIS > 0:
        FRAME_SKIP = max(1, round(original_fps / TARGET_FPS_ANALYSIS))
    else:
        FRAME_SKIP = 30

    print(f"원본 FPS: {original_fps:.2f}. 목표 분석 주기: {FRAME_SKIP} 프레임마다 1회 분석")
    out = cv2.VideoWriter(output_path, cv2.VideoWriter_fourcc(*'mp4v'), original_fps, (frame_width, frame_height))

    person_wait_times: Dict[int, float] = {}
    person_miss_count: Dict[int, int] = {}
    last_analysis_data: Dict[int, Tuple[Tuple[int, int, int, int], str]] = {}
    frame_count = 0
    
    # [수정됨] queue_count를 루프 밖에서 선언하여 값을 유지하도록 변경
    queue_count = 0

    while cap.isOpened():
        ret, frame = cap.read()
        current_time = time.time()
        if not ret:
            print("동영상 처리가 완료되었습니다. 계속 실행을 위해 처음으로 돌아갑니다.")
            cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
            continue

        frame_count += 1
        annotated_frame = frame.copy()
        perform_analysis = (frame_count % FRAME_SKIP == 0)

        if perform_analysis:
            results = detector.track(frame, persist=True, classes=[0], tracker="bytetrack.yaml", verbose=False)
            current_track_ids = set()
            new_analysis_data: Dict[int, Tuple[Tuple[int, int, int, int], str]] = {}

            if results and results[0].boxes and results[0].boxes.id is not None:
                boxes = results[0].boxes.xyxy.cpu().numpy()
                track_ids = results[0].boxes.id.cpu().numpy().astype(int)

                for box, id in zip(boxes, track_ids):
                    x1, y1, x2, y2 = map(int, box)
                    center_x = (x1 + x2) / 2
                    center_y = (y1 + y2) / 2
                    current_track_ids.add(id)
                    person_miss_count[id] = 0

                    is_in_roi = cv2.pointPolygonTest(ROI_POLYGON, (center_x, center_y), False) >= 0
                    
                    status = "Passing by"
                    if is_in_roi:
                        if id not in person_wait_times: person_wait_times[id] = current_time
                        time_spent = current_time - person_wait_times[id]
                        if time_spent >= MIN_WAIT_TIME_SECONDS: status = "In Queue"
                        else: status = f"Entering ({time_spent:.1f}s)"
                    else:
                        person_wait_times.pop(id, None)
                    new_analysis_data[id] = ((x1, y1, x2, y2), status)

                ids_to_check_for_miss = list(person_wait_times.keys() - current_track_ids)
                ids_to_remove = []
                for id in ids_to_check_for_miss:
                    person_miss_count[id] = person_miss_count.get(id, 0) + 1
                    if person_miss_count[id] > MAX_MISS_CYCLES: ids_to_remove.append(id)
                    else:
                        if id in last_analysis_data: new_analysis_data[id] = last_analysis_data[id]
                
                for id in ids_to_remove:
                    person_wait_times.pop(id, None)
                    person_miss_count.pop(id, None)

            last_analysis_data = new_analysis_data
            
            queue_count = sum(1 for _, status in last_analysis_data.values() if "In Queue" in status)
            
            # [수정됨] queue_count를 계산했을 때만 공유 변수에 값을 저장
            with lock:
                app_state["queue_count"] = queue_count

        for id, (box, status) in last_analysis_data.items():
            x1, y1, x2, y2 = box
            color = (0, 255, 0) if "In Queue" in status else (0, 255, 255) if "Entering" in status else (128, 128, 128)
            cv2.rectangle(annotated_frame, (x1, y1), (x2, y2), color, 2)
            cv2.putText(annotated_frame, f"ID {id} | {status}", (x1, y1 - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)

        cv2.polylines(annotated_frame, [ROI_POLYGON], isClosed=True, color=(255, 0, 0), thickness=2)
        
        # [수정됨] 화면에 그릴 때도 항상 최신 값을 공유 변수에서 가져와 사용
        with lock:
            cv2.putText(annotated_frame, f"QUEUE: {app_state['queue_count']}", (polygon_points[0][0], polygon_points[0][1] - 10),
                        cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 0, 0), 2)
            
            global output_frame
            output_frame = annotated_frame.copy()

        out.write(annotated_frame)

    cap.release()
    out.release()
    cv2.destroyAllWindows()

# --- Flask 웹 서버 설정 ---
app = Flask(__name__)
CORS(app)

@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

@app.route('/script.js')
def serve_script():
    return send_from_directory('.', 'script.js')

@app.route('/style.css')
def serve_style():
    return send_from_directory('.', 'style.css')

@app.route('/api/queue')
def get_queue_status():
    with lock:
        count = app_state["queue_count"]
    return jsonify({"queue_count": count})

def generate_video_stream():
    global output_frame, lock
    while True:
        with lock:
            if output_frame is None: continue
            (flag, encodedImage) = cv2.imencode(".jpg", output_frame)
            if not flag: continue
        yield(b'--frame\r\n' b'Content-Type: image/jpeg\r\n\r\n' + bytearray(encodedImage) + b'\r\n')
        
@app.route('/video_feed')
def video_feed():
    return Response(generate_video_stream(), mimetype="multipart/x-mixed-replace; boundary=frame")

if __name__ == '__main__':
    analysis_thread = threading.Thread(target=run_video_analysis, daemon=True)
    analysis_thread.start()
    app.run(host='0.0.0.0', port=5000, use_reloader=False)

    #김철호 브랜치.