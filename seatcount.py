import cv2
from ultralytics import YOLO
import os
import time
import numpy as np
from typing import Dict, Tuple, Optional

# -------------------------------------------------------------
# --- 1. 설정 변수 (사용자 수정 필요) ---
# -------------------------------------------------------------

# ❗ [필수 수정] 분석할 동영상 파일 경로
VIDEO_FILE = "seatcount2.mp4"

# ❗ [필수 수정] 카메라로 커버되는 영역의 총 좌석 수 (대기열 맥스 수로 사용)
TOTAL_SEATS = 14

# ❗ [필수 수정] 대기 영역(ROI) 다각형 좌표: NumPy 배열로 정의
# 이 영역 안에 사람의 하단 중심이 있어야 카운트됩니다.
ROI_POLYGON = np.array([
    [140, 140],  # 1. 왼쪽 위 점
    [600, 110],  # 2. 중간 위 점
    [1586, 442],  # 3. 오른쪽 점
    [1581, 998],  # 4. 오른쪽 아래 점
    [549, 1045]  # 5.
], np.int32)

# 사용할 YOLO 모델 (person 감지 및 추적용)
MODEL_NAME = 'yolov8n.pt'  # 👈 Pose 모델 제거, 일반 YOLO 모델 사용

# --- 정밀도 및 성능 설정 ---
TARGET_FPS_ANALYSIS = 1.0  # 분석 주기: 1초에 1회 분석 (성능 최적화)
MIN_WAIT_TIME_SECONDS = 3.0  # 👈 대기 인원으로 확정될 최소 대기 시간 (3.0초)
MAX_MISS_CYCLES = 10  # 사람이 가려져도 상태를 유지할 최대 관용 주기 (약 10초)

# -------------------------------------------------------------
# --- 2. 초기화 ---
# -------------------------------------------------------------

output_dir = "output_waiting_counter"
os.makedirs(output_dir, exist_ok=True)
# 🚨 수정: 출력 파일 확장자를 .mp4로 재변경
output_path = os.path.join(output_dir, "waiting_counter_result.mp4")

# YOLO 모델 로드 (추적 기능 사용)
detector = YOLO(MODEL_NAME)

# 동영상 파일 열기
cap = cv2.VideoCapture(VIDEO_FILE)
if not cap.isOpened():
    print(f"오류: 동영상 파일을 열 수 없습니다: {VIDEO_FILE}")
    exit()

# 결과 동영상 저장을 위한 설정
frame_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
frame_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

# 🚨 FPS 값을 30FPS로 강제 적용하여 안정화 🚨
SAFE_FPS = 30 # 출력 파일의 FPS를 30으로 고정합니다.

# 분석 주기 계산: (원본 FPS / 목표 분석 FPS)
original_fps_float = cap.get(cv2.CAP_PROP_FPS) # 실제 원본 FPS 사용 (예: 29.97)
if original_fps_float <= 0:
    original_fps_float = 30 # 원본 FPS를 읽지 못하면 30으로 가정

if original_fps_float > 0 and TARGET_FPS_ANALYSIS > 0:
    FRAME_SKIP = max(1, round(original_fps_float / TARGET_FPS_ANALYSIS))
else:
    FRAME_SKIP = 30

print(f"총 대기 맥스: {TOTAL_SEATS}명. 출력 FPS: {SAFE_FPS} -> 분석 주기: {FRAME_SKIP} 프레임마다 1회 분석")

# 🚨 수정: 코덱을 MP4V로 재변경
out = cv2.VideoWriter(output_path, cv2.VideoWriter_fourcc(*'mp4v'), SAFE_FPS, (frame_width, frame_height))

# --- 상태 저장소 ---
# {tracker_id: entry_time} : ROI 진입 시간을 저장
person_entry_time: Dict[int, float] = {}
# {tracker_id: miss_count} : 추적에 실패한 분석 주기 횟수 (관용 주기용)
person_miss_count: Dict[int, int] = {}
# (box, status)
last_analysis_data: Dict[int, Tuple[Tuple[int, int, int, int], str]] = {}

frame_count = 0
waiting_count = 0

# -------------------------------------------------------------
# --- 3. 동영상 프레임별 처리 루프 ---
# -------------------------------------------------------------
while cap.isOpened():
    ret, frame = cap.read()
    current_time = time.time()

    if not ret:
        print("동영상 처리가 완료되었습니다.")
        break

    frame_count += 1
    annotated_frame = frame.copy()

    perform_analysis = (frame_count % FRAME_SKIP == 0)

    if perform_analysis:
        # --- (A) YOLO 추적 분석 수행 (지정된 프레임만) ---

        results = detector.track(
            frame,
            persist=True,
            classes=[0],  # person 클래스만 추적
            tracker="bytetrack.yaml",
            verbose=False
        )

        current_track_ids = set()
        new_analysis_data: Dict[int, Tuple[Tuple[int, int, int, int], str]] = {}
        waiting_count_this_cycle = 0

        if results and results[0].boxes and results[0].boxes.id is not None:
            boxes = results[0].boxes.xyxy.cpu().numpy()
            track_ids = results[0].boxes.id.cpu().numpy().astype(int)

            # --- 대기 인원 카운팅 ---
            for box, id in zip(boxes, track_ids):
                x1, y1, x2, y2 = map(int, box)

                # 사람의 바운딩 박스 하단 중심점 (ROI 판단 기준)
                center_x = (x1 + x2) / 2
                bottom_y = y2
                current_track_ids.add(id)
                person_miss_count[id] = 0

                # 1. ROI 영역 확인 (다각형 내부에 있는지 검사)
                # cv2.pointPolygonTest() 결과 >= 0 이면 내부 또는 경계
                is_in_roi = cv2.pointPolygonTest(ROI_POLYGON, (int(center_x), int(bottom_y)), False) >= 0

                status = "Passing/Outside"

                if is_in_roi:  # 👈 ROI 내부에 있는 경우
                    if id not in person_entry_time:
                        # 2. 새로 진입: 진입 시간 기록
                        person_entry_time[id] = current_time
                        status = "Entering"

                    time_waiting = current_time - person_entry_time.get(id, current_time)

                    if time_waiting >= MIN_WAIT_TIME_SECONDS:
                        # 3. 최소 대기 시간 초과: 대기 인원으로 확정 (움직임 상관 없음)
                        status = "WAITING"
                        waiting_count_this_cycle += 1
                    else:
                        status = f"Entering ({time_waiting:.1f}s)"
                else:
                    # ROI 밖에 있는 경우, 대기열 기록에서 제거
                    person_entry_time.pop(id, None)

                new_analysis_data[id] = ((x1, y1, x2, y2), status)

            # 4. 사라진 객체(관용 주기 적용) - 로직 유지
            # Entry Time이 기록되었으나 현재 프레임에 감지되지 않은 ID
            ids_to_check_for_miss = list(person_entry_time.keys() - current_track_ids)

            ids_to_remove = []
            for id in ids_to_check_for_miss:
                person_miss_count[id] = person_miss_count.get(id, 0) + 1

                if person_miss_count[id] > MAX_MISS_CYCLES:
                    ids_to_remove.append(id)
                else:
                    # Miss Count 허용 범위 내: 이전 상태와 박스 유지 (관용 주기)
                    if id in last_analysis_data:
                        new_analysis_data[id] = last_analysis_data[id]

            # 최종 제거
            for id in ids_to_remove:
                person_entry_time.pop(id, None)
                person_miss_count.pop(id, None)

            # 5. 분석 결과 업데이트 및 카운트
            last_analysis_data = new_analysis_data
            waiting_count = waiting_count_this_cycle

    # --- (B) 시각화 적용 (모든 프레임) ---

    # 시각화 데이터는 TOTAL_SEATS(맥스 인원)를 기준으로 표시
    occupied_seats = waiting_count
    available_seats = max(0, TOTAL_SEATS - occupied_seats)
    occupancy_percent = (occupied_seats / TOTAL_SEATS) * 100 if TOTAL_SEATS > 0 else 0
    available_percent = 100 - occupancy_percent

    # 건너뛴 프레임에서도 이전 분석 결과를 사용해 시각화
    for id, (box, status) in last_analysis_data.items():
        x1, y1, x2, y2 = box

        if status == "WAITING":
            color = (0, 0, 255)  # 빨간색 (대기 확정)
        elif "Entering" in status:
            color = (0, 165, 255)  # 주황색 (진입 후 대기 시간 경과 중)
        else:
            color = (0, 255, 0)  # 초록색 (지나가는/밖)

        cv2.rectangle(annotated_frame, (x1, y1), (x2, y2), color, 2)
        cv2.putText(annotated_frame, f"ID {id} | {status}", (x1, y1 - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)

    # ROI 영역 그리기
    # 다각형 영역을 그리기 위해 polylines 사용
    cv2.polylines(annotated_frame, [ROI_POLYGON], isClosed=True, color=(255, 0, 0), thickness=2)

    # 최종 결과 표시
    cv2.putText(annotated_frame, f"MAX CAPACITY: {TOTAL_SEATS}", (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.8,
                (255, 255, 255), 2)
    cv2.putText(annotated_frame, f"WAITING: {waiting_count} ({occupancy_percent:.1f}%)", (10, 60),
                cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 255), 2)
    cv2.putText(annotated_frame, f"AVAILABLE SLOTS: {available_seats} ({available_percent:.1f}%)", (10, 90),
                cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 0), 2)

    # 처리된 프레임을 결과 동영상에 저장
    out.write(annotated_frame)

    # (선택 사항) 실시간 화면 표시
    cv2.imshow('Waiting Queue Counter (Conservative)', annotated_frame)
    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

# --- 4. 자원 해제 ---
cap.release()
out.release()
cv2.destroyAllWindows()

print(f"분석 완료! 결과가 '{output_path}'에 저장되었습니다.")
