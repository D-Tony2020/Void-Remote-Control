import { HandLandmarker, FilesetResolver } from '../libs/vision_bundle.mjs';

// ─── DOM Elements ───
const video = document.getElementById('camera');
const canvas = document.getElementById('overlay');
const ctx = canvas.getContext('2d');
const toggleBtn = document.getElementById('toggle-btn');
const statusBadge = document.getElementById('status-badge');
const gestureHint = document.getElementById('gesture-hint');
const sensitivityInput = document.getElementById('sensitivity');
const sensitivityVal = document.getElementById('sensitivity-val');
const deadzoneInput = document.getElementById('deadzone');
const deadzoneVal = document.getElementById('deadzone-val');
const arrowUp = document.getElementById('arrow-up');
const arrowDown = document.getElementById('arrow-down');
const speedFill = document.getElementById('speed-fill');
const errorMsg = document.getElementById('error-msg');

// ─── State ───
let handLandmarker = null;
let isRunning = false;
let animFrameId = null;
let lastPalmY = null;
let smoothedDelta = 0;

// Configurable
let sensitivity = 5;
let deadzone = 8;

// ─── Settings ───
sensitivityInput.addEventListener('input', () => {
  sensitivity = parseInt(sensitivityInput.value);
  sensitivityVal.textContent = sensitivity;
});

deadzoneInput.addEventListener('input', () => {
  deadzone = parseInt(deadzoneInput.value);
  deadzoneVal.textContent = deadzone;
});

// ─── Utility: Promise with timeout ───
function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label}超时（${ms / 1000}秒）`)), ms)
    )
  ]);
}

// ─── MediaPipe Init ───
async function initHandLandmarker() {
  showProgress('正在加载手势识别引擎...');

  let vision;
  try {
    vision = await withTimeout(
      FilesetResolver.forVisionTasks('../libs/wasm'),
      15000,
      'WASM引擎加载'
    );
  } catch (err) {
    showError(`WASM引擎加载失败: ${err.message}`);
    throw err;
  }

  showProgress('正在下载手势模型...');

  // Try GPU first, fallback to CPU
  const delegates = ['GPU', 'CPU'];
  let lastErr = null;

  for (const delegate of delegates) {
    try {
      showProgress(`正在初始化模型 (${delegate})...`);
      handLandmarker = await withTimeout(
        HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
            delegate
          },
          runningMode: 'VIDEO',
          numHands: 1,
          minHandDetectionConfidence: 0.5,
          minHandPresenceConfidence: 0.5,
          minTrackingConfidence: 0.5
        }),
        30000,
        '模型加载'
      );
      console.log(`HandLandmarker initialized with ${delegate} delegate`);
      return; // success
    } catch (err) {
      console.warn(`${delegate} delegate failed:`, err.message);
      lastErr = err;
      // continue to next delegate
    }
  }

  showError(`模型加载失败: ${lastErr.message}`);
  throw lastErr;
}

// ─── Camera ───
async function startCamera() {
  showProgress('正在请求摄像头权限...');

  let stream;
  try {
    stream = await withTimeout(
      navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }
      }),
      10000,
      '摄像头访问'
    );
  } catch (err) {
    let userMsg;
    if (err.name === 'NotAllowedError' || err.message.includes('dismissed')) {
      userMsg = '摄像头权限被拒绝。请在浏览器设置中允许此扩展访问摄像头。';
    } else if (err.name === 'NotFoundError') {
      userMsg = '未检测到摄像头设备。';
    } else if (err.name === 'NotReadableError') {
      userMsg = '摄像头被其他应用占用。';
    } else {
      userMsg = `摄像头访问失败: ${err.message}`;
    }
    showError(userMsg);
    throw err;
  }

  video.srcObject = stream;

  // Wait for video metadata to be ready before playing
  await new Promise((resolve, reject) => {
    video.onloadedmetadata = resolve;
    video.onerror = () => reject(new Error('视频流加载失败'));
    // Safety timeout in case metadata never fires
    setTimeout(() => reject(new Error('视频元数据加载超时')), 5000);
  });

  await video.play();

  // Now videoWidth/videoHeight are guaranteed to be valid
  canvas.width = video.videoWidth || 640;
  canvas.height = video.videoHeight || 480;
}

function stopCamera() {
  if (video.srcObject) {
    video.srcObject.getTracks().forEach(t => t.stop());
    video.srcObject = null;
  }
}

// ─── Gesture Detection ───
function isFingerExtended(landmarks, tipIdx, pipIdx) {
  return landmarks[tipIdx].y < landmarks[pipIdx].y;
}

function isHandOpen(landmarks) {
  const indexOpen = isFingerExtended(landmarks, 8, 6);
  const middleOpen = isFingerExtended(landmarks, 12, 10);
  const ringOpen = isFingerExtended(landmarks, 16, 14);
  const pinkyOpen = isFingerExtended(landmarks, 20, 18);

  const count = [indexOpen, middleOpen, ringOpen, pinkyOpen].filter(Boolean).length;
  return count >= 3;
}

function getPalmCenterY(landmarks) {
  return (landmarks[0].y + landmarks[9].y) / 2;
}

function processFrame() {
  if (!isRunning || !handLandmarker) return;

  let result;
  try {
    result = handLandmarker.detectForVideo(video, performance.now());
  } catch (err) {
    console.error('Detection error:', err);
    animFrameId = requestAnimationFrame(processFrame);
    return;
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (result.landmarks && result.landmarks.length > 0) {
    const landmarks = result.landmarks[0];

    drawHand(landmarks);

    if (isHandOpen(landmarks)) {
      const palmY = getPalmCenterY(landmarks);
      const palmYPixel = palmY * canvas.height;

      if (lastPalmY !== null) {
        const rawDelta = palmYPixel - lastPalmY;

        if (Math.abs(rawDelta) > deadzone) {
          const activeDelta = rawDelta > 0
            ? rawDelta - deadzone
            : rawDelta + deadzone;

          smoothedDelta = smoothedDelta * 0.6 + activeDelta * 0.4;

          const scrollSpeed = smoothedDelta * sensitivity * 0.5;
          sendScrollCommand(scrollSpeed);
          updateScrollUI(scrollSpeed);
        } else {
          smoothedDelta *= 0.8;
          if (Math.abs(smoothedDelta) < 0.5) {
            sendScrollCommand(0);
            updateScrollUI(0);
          }
        }
      }

      lastPalmY = palmYPixel;
      setStatus('tracking', '追踪中');
      gestureHint.textContent = '手掌移动控制滚动';
    } else {
      lastPalmY = null;
      smoothedDelta = 0;
      sendScrollCommand(0);
      updateScrollUI(0);
      setStatus('active', '已暂停');
      gestureHint.textContent = '张开手掌继续';
    }
  } else {
    lastPalmY = null;
    smoothedDelta = 0;
    sendScrollCommand(0);
    updateScrollUI(0);
    setStatus('active', '等待手势');
    gestureHint.textContent = '将手掌对准摄像头';
  }

  animFrameId = requestAnimationFrame(processFrame);
}

// ─── Drawing ───
const CONNECTIONS = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [5,9],[9,10],[10,11],[11,12],
  [9,13],[13,14],[14,15],[15,16],
  [13,17],[17,18],[18,19],[19,20],
  [0,17]
];

function drawHand(landmarks) {
  ctx.strokeStyle = 'rgba(167, 139, 250, 0.6)';
  ctx.lineWidth = 2;
  for (const [i, j] of CONNECTIONS) {
    ctx.beginPath();
    ctx.moveTo(landmarks[i].x * canvas.width, landmarks[i].y * canvas.height);
    ctx.lineTo(landmarks[j].x * canvas.width, landmarks[j].y * canvas.height);
    ctx.stroke();
  }

  for (const lm of landmarks) {
    ctx.beginPath();
    ctx.arc(lm.x * canvas.width, lm.y * canvas.height, 4, 0, 2 * Math.PI);
    ctx.fillStyle = '#a78bfa';
    ctx.fill();
  }

  const palmY = getPalmCenterY(landmarks);
  const palmX = (landmarks[0].x + landmarks[9].x) / 2;
  ctx.beginPath();
  ctx.arc(palmX * canvas.width, palmY * canvas.height, 8, 0, 2 * Math.PI);
  ctx.fillStyle = 'rgba(124, 58, 237, 0.5)';
  ctx.fill();
  ctx.strokeStyle = '#7c3aed';
  ctx.lineWidth = 2;
  ctx.stroke();
}

// ─── Scroll Command ───
let lastSentSpeed = 0;
let sendThrottleTimer = null;

function sendScrollCommand(speed) {
  if (sendThrottleTimer) return;

  const roundedSpeed = Math.round(speed * 10) / 10;
  if (roundedSpeed === lastSentSpeed) return;

  lastSentSpeed = roundedSpeed;

  chrome.runtime.sendMessage({
    type: roundedSpeed === 0 ? 'gesture-stop' : 'gesture-scroll',
    speed: roundedSpeed
  }).catch(() => {
    // Extension context invalidated — ignore
  });

  sendThrottleTimer = setTimeout(() => {
    sendThrottleTimer = null;
  }, 33);
}

// ─── UI Helpers ───
function setStatus(type, text) {
  statusBadge.textContent = text;
  statusBadge.className = 'badge';
  if (type === 'tracking') statusBadge.classList.add('badge-tracking');
  else if (type === 'active') statusBadge.classList.add('badge-active');
  else statusBadge.classList.add('badge-idle');
}

function updateScrollUI(speed) {
  const absSpeed = Math.min(Math.abs(speed), 50);
  const pct = (absSpeed / 50) * 100;

  speedFill.style.width = `${pct}%`;
  speedFill.className = 'speed-fill';
  arrowUp.className = 'arrow arrow-up';
  arrowDown.className = 'arrow arrow-down';

  if (speed < -1) {
    speedFill.classList.add('up');
    arrowUp.classList.add('active-up');
  } else if (speed > 1) {
    speedFill.classList.add('down');
    arrowDown.classList.add('active-down');
  }
}

function showError(msg) {
  errorMsg.textContent = msg;
  errorMsg.hidden = false;
  errorMsg.classList.remove('progress');
}

function showProgress(msg) {
  errorMsg.textContent = msg;
  errorMsg.hidden = false;
  errorMsg.classList.add('progress');
}

function hideMessages() {
  errorMsg.hidden = true;
  errorMsg.classList.remove('progress');
}

// ─── Toggle ───
toggleBtn.addEventListener('click', async () => {
  if (isRunning) {
    stop();
  } else {
    await start();
  }
});

async function start() {
  toggleBtn.disabled = true;
  toggleBtn.textContent = '加载中...';
  hideMessages();

  try {
    if (!handLandmarker) {
      await initHandLandmarker();
    }
    await startCamera();

    isRunning = true;
    lastPalmY = null;
    smoothedDelta = 0;

    toggleBtn.textContent = '停止追踪';
    toggleBtn.classList.add('active');
    toggleBtn.disabled = false;
    setStatus('active', '运行中');
    hideMessages();

    processFrame();
  } catch (err) {
    console.error('Start failed:', err);
    stopCamera();
    toggleBtn.textContent = '启动追踪';
    toggleBtn.disabled = false;
    setStatus('idle', '错误');
  }
}

function stop() {
  isRunning = false;
  if (animFrameId) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }

  stopCamera();
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  sendScrollCommand(0);
  updateScrollUI(0);

  lastPalmY = null;
  smoothedDelta = 0;

  toggleBtn.textContent = '启动追踪';
  toggleBtn.classList.remove('active');
  setStatus('idle', '待机');
  gestureHint.textContent = '张开手掌开始控制';
  hideMessages();
}
