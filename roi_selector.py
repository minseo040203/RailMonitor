#얘는 영상 넣으면 좌표찍는거 실행되고, 찍은 점 좌표 저장되는 모듈.
import cv2
import numpy as np

# --- 설정 ---
VIDEO_FILE = "toilet_line.mp4" # 좌표를 찾을 영상 파일
MAX_DISPLAY_WIDTH = 1280       # 화면에 표시될 창의 최대 가로 크기 (px)
# ------------

polygon_points = []
scale_factor = 1.0 # 원본 영상과 화면 표시 영상의 크기 비율

def mouse_callback(event, x, y, flags, param):
    """마우스 클릭 이벤트가 발생했을 때 실행될 함수"""
    global scale_factor
    if event == cv2.EVENT_LBUTTONDOWN:
        # [수정] 축소된 이미지에 클릭했으므로, 원본 좌표로 변환하여 저장
        original_x = int(x / scale_factor)
        original_y = int(y / scale_factor)
        polygon_points.append([original_x, original_y])
        
        # 화면에는 현재 보이는 위치에 초록색 원 그리기
        cv2.circle(param['image'], (x, y), 5, (0, 255, 0), -1)
        if len(polygon_points) > 1:
            # 화면에 보이는 점들끼리 선 긋기
            scaled_points = (np.array(polygon_points) * scale_factor).astype(int)
            cv2.line(param['image'], tuple(scaled_points[-2]), tuple(scaled_points[-1]), (0, 255, 0), 2)
        
        cv2.imshow("Select Polygon ROI", param['image'])
        print(f"점 추가됨: (화면 좌표: {x}, {y}) -> (원본 좌표: {original_x}, {original_y})")

cap = cv2.VideoCapture(VIDEO_FILE)
if not cap.isOpened():
    print(f"오류: 동영상 파일을 열 수 없습니다: {VIDEO_FILE}")
    exit()

ret, first_frame = cap.read()
if not ret:
    print("오류: 동영상에서 프레임을 읽을 수 없습니다.")
    cap.release()
    exit()

# --- [추가] 영상 리사이즈 로직 ---
original_height, original_width = first_frame.shape[:2]

# 영상의 가로 크기가 설정한 최대 크기보다 크면 비율에 맞게 축소
if original_width > MAX_DISPLAY_WIDTH:
    scale_factor = MAX_DISPLAY_WIDTH / original_width
    new_width = MAX_DISPLAY_WIDTH
    new_height = int(original_height * scale_factor)
    display_frame = cv2.resize(first_frame, (new_width, new_height))
    print(f"원본 영상({original_width}x{original_height})이 너무 커서 표시용({new_width}x{new_height})으로 축소합니다.")
else:
    display_frame = first_frame # 크기가 적당하면 그대로 사용
# -----------------------------------

clone = display_frame.copy()
cv2.namedWindow("Select Polygon ROI")
cv2.setMouseCallback("Select Polygon ROI", mouse_callback, {'image': display_frame})

print("\n--- 다각형 ROI 설정 안내 ---")
print("1. 영상 위에서 대기열을 감싸는 다각형의 꼭짓점을 마우스로 순서대로 클릭하세요.")
print("2. 설정이 완료되면 키보드에서 'c' 키를 누르세요.")
print("3. 잘못 클릭했다면 'r' 키를 눌러 초기화할 수 있습니다.")

while True:
    cv2.imshow("Select Polygon ROI", display_frame)
    key = cv2.waitKey(1) & 0xFF
    
    if key == ord('r'):
        display_frame = clone.copy()
        polygon_points = []
        print("리셋되었습니다. 다시 클릭하세요.")
    
    elif key == ord('c'):
        if len(polygon_points) < 3:
            print("오류: 최소 3개 이상의 점을 클릭해야 합니다.")
        else:
            print("\n--- 설정 완료! 아래 코드를 복사해서 사용하세요 ---")
            print(f"ROI_POLYGON = np.array({polygon_points}, np.int32)")
            print("-------------------------------------------------")
            break

cv2.destroyAllWindows()
cap.release()