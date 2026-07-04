// src/CameraApp.jsx - COMPLETE MERGED VERSION
import React, { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import * as faceapi from '@vladmandic/face-api';

const CameraApp = forwardRef(function CameraApp({ user, mode = 'checkin', regNumber, onSuccess }, ref) {
  // ========== ORIGINAL STATE VARIABLES (PRESERVED) ==========
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [name, setName] = useState('');
  
  const [status, setStatus] = useState('');
  const [isCheckingLiveness, setIsCheckingLiveness] = useState(false);
  
  // ========== LIVENESS DETECTION STATE (PRESERVED) ==========
  const [blinkDetected, setBlinkDetected] = useState(false);
  const [movementDetected, setMovementDetected] = useState(false);
  
  const [faceDetected, setFaceDetected] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [stream, setStream] = useState(null);
  const streamRef = useRef(null);
  const [flashActive, setFlashActive] = useState(false);
  const [devices, setDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState(null);
  const [cameraError, setCameraError] = useState('');
  const isAutoCheckingRef = useRef(false);
  const lastAutoCheckRef = useRef(0);
  const AUTO_CHECK_COOLDOWN = 30 * 1000; // 30s between automatic check-ins
  
  // Reference for liveness detection interval
  const livenessIntervalRef = useRef(null);
  const previousFrameRef = useRef(null);
  const blinkCountRef = useRef(0);
  const movementConsecutiveRef = useRef(0);
  const faceDescriptorRef = useRef(null);

  
  useEffect(() => {
    // only load face-api models once
    (async () => {
      try {
        const modelUrl = '/models';
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(modelUrl),
          faceapi.nets.faceLandmark68Net.loadFromUri(modelUrl),
          faceapi.nets.faceRecognitionNet.loadFromUri(modelUrl)
        ]);
        setModelsLoaded(true);
        setStatus('Face detection models loaded');
      } catch (err) {
        console.error('Could not load face-api models', err);
        setStatus('Failed to load face detection models');
      }
    })();
  }, []);

  // ========== INITIALIZE NAME FROM USER PROP ==========
  useEffect(() => {
    if (user && !name) {
      const candidate = (user && (user.reg_number || user.regNumber || user.name)) || '';
      setName(typeof candidate === 'string' ? candidate : String(candidate));
    }
  }, [user, name]);
  

  const MODEL_BASE_PATH = '/models';
  const detectorOptions = new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 });

  const detectFaceDescriptor = async () => {
    if (!modelsLoaded || !videoRef.current) return null;
    try {
      const result = await faceapi.detectSingleFace(videoRef.current, detectorOptions)
        .withFaceLandmarks()
        .withFaceDescriptor();
      if (result && result.descriptor) {
        setFaceDetected(true);
        faceDescriptorRef.current = Array.from(result.descriptor);
        return faceDescriptorRef.current;
      }
    } catch (err) {
      if (import.meta.env.DEV) console.warn('Face detection error:', err);
    }
    setFaceDetected(false);
    faceDescriptorRef.current = null;
    return null;
  };

  const getFaceDescriptor = async () => {
    if (faceDescriptorRef.current && Array.isArray(faceDescriptorRef.current) && faceDescriptorRef.current.length === 128) {
      return faceDescriptorRef.current;
    }
    return await detectFaceDescriptor();
  };

  useEffect(() => {
    if (!modelsLoaded) return undefined;
    let interval = null;
    const startDetectionLoop = () => {
      interval = setInterval(async () => {
        if (!videoRef.current || videoRef.current.readyState < 2) return;
        await detectFaceDescriptor();
      }, 1200);
    };
    startDetectionLoop();
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [modelsLoaded]);

  // ========== START CAMERA ==========
  const stopMediaStream = (mediaStream) => {
    if (!mediaStream) return;
    mediaStream.getTracks().forEach(track => track.stop());
  };

  const stopCurrentStream = () => {
    if (streamRef.current) {
      stopMediaStream(streamRef.current);
      streamRef.current = null;
    }
  };

  const listCameraDevices = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
      return [];
    }

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cameraInputs = devices.filter(d => d.kind === 'videoinput');
      setDevices(cameraInputs);
      if (!selectedDeviceId && cameraInputs.length > 0) {
        setSelectedDeviceId(cameraInputs[0].deviceId);
      }
      return cameraInputs;
    } catch (err) {
      console.warn('Failed to enumerate camera devices:', err);
      return [];
    }
  };

  const requestCamera = async (deviceId) => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('Media devices are not available in this browser.');
    }

    const desiredDeviceId = deviceId || selectedDeviceId;
    if (desiredDeviceId) {
      try {
        return await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: desiredDeviceId } }, audio: false });
      } catch (err) {
        if (err.name === 'NotFoundError' || err.name === 'OverconstrainedError' || err.name === 'TypeError') {
          setSelectedDeviceId(null);
          console.warn('Specific camera request failed, falling back to generic camera request:', err.name);
        } else {
          throw err;
        }
      }
    }

    try {
      return await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    } catch (err) {
      console.warn('Generic camera fallback failed:', err.name, err.message);
      if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(d => d.kind === 'videoinput');
        console.warn('Available video devices:', videoDevices);
      }
      throw err;
    }
  };

  const startCamera = async () => {
    try {
      stopCurrentStream();
      setCameraError('');
      setStatus('Requesting camera access...');

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Media devices are not available in this browser.');
      }

      let mediaStream;
      try {
        mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      } catch (err) {
        console.warn('Initial userMedia permission request failed:', err);
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError' || err.name === 'SecurityError') {
          throw err;
        }
      }

      const cameraInputs = await listCameraDevices();
      let deviceIdToUse = selectedDeviceId;
      if (!deviceIdToUse && cameraInputs.length > 0) {
        deviceIdToUse = cameraInputs[0].deviceId;
        setSelectedDeviceId(deviceIdToUse);
      }

      if (selectedDeviceId && cameraInputs.every(device => device.deviceId !== selectedDeviceId)) {
        deviceIdToUse = cameraInputs[0]?.deviceId || null;
        if (deviceIdToUse) {
          setSelectedDeviceId(deviceIdToUse);
        }
      }

      if (!mediaStream) {
        mediaStream = await requestCamera(deviceIdToUse);
      }

      streamRef.current = mediaStream;
      setStream(mediaStream);
      setCameraError('');
      setStatus('Camera ready');
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err) {
      console.warn('Camera startup failed:', err);
      let message = 'Camera error: ' + (err.message || 'Unable to open camera.');
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError' || err.name === 'SecurityError') {
        message = 'Camera error: permission denied. Please allow camera access.';
      } else if (err.name === 'NotFoundError' || err.name === 'OverconstrainedError') {
        message = 'Camera error: Requested device not found. Please choose another camera or reconnect your webcam.';
      }
      setCameraError(message);
      setStatus(message);
      setSelectedDeviceId(null);
      await listCameraDevices();
    }
  };

  useEffect(() => {
    startCamera();
    return () => {
      stopCurrentStream();
    };
  }, [selectedDeviceId]);

  // ========== ORIGINAL LIVENESS DETECTION FUNCTIONS (PRESERVED) ==========
  function detectMovement(prevFrame, currFrame) {
    let diff = 0;
    const sampleSize = 100;
    for (let i = 0; i < sampleSize; i++) {
      const pixelIndex = Math.floor(Math.random() * prevFrame.data.length);
      const prevValue = prevFrame.data[pixelIndex];
      const currValue = currFrame.data[pixelIndex];
      diff += Math.abs(prevValue - currValue) / 255;
    }
    return diff / sampleSize;
  }
  
  function detectEyeRegionChange(prevFrame, currFrame) {
    const eyeRegionHeight = Math.floor(prevFrame.height * 0.3);
    const eyeRegionStart = Math.floor(prevFrame.height * 0.2);
    
    let diff = 0;
    let sampleCount = 0;
    
    for (let y = eyeRegionStart; y < eyeRegionStart + eyeRegionHeight; y += 10) {
      for (let x = 0; x < prevFrame.width; x += 10) {
        const idx = (y * prevFrame.width + x) * 4;
        if (idx < prevFrame.data.length) {
          const prevAvg = (prevFrame.data[idx] + prevFrame.data[idx+1] + prevFrame.data[idx+2]) / 3;
          const currAvg = (currFrame.data[idx] + currFrame.data[idx+1] + currFrame.data[idx+2]) / 3;
          diff += Math.abs(prevAvg - currAvg) / 255;
          sampleCount++;
        }
      }
    }
    
    return diff / sampleCount;
  }

  // ========== ORIGINAL LIVENESS DETECTION LOOP (PRESERVED) ==========
  useEffect(() => {
    // always run liveness/motion sampling regardless of models
    
    const startLivenessDetection = () => {
      livenessIntervalRef.current = setInterval(() => {
        if (!videoRef.current || isCheckingLiveness) return;
        
        const canvas = document.createElement('canvas');
        canvas.width = videoRef.current.videoWidth;
        canvas.height = videoRef.current.videoHeight;
        // Guard against zero-dimension canvas which causes getImageData to throw
        if (canvas.width === 0 || canvas.height === 0) return;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        
        const currentFrame = ctx.getImageData(0, 0, canvas.width, canvas.height);
        
        if (previousFrameRef.current) {
          const movement = detectMovement(previousFrameRef.current, currentFrame);
          // Moderate movement threshold for typical indoor lighting
          if (movement > 0.035) {
            setMovementDetected(true);
            movementConsecutiveRef.current++;
          } else {
            movementConsecutiveRef.current = 0;
          }
          
          const eyeRegionChange = detectEyeRegionChange(previousFrameRef.current, currentFrame);
          // Moderate eye-change threshold and accept a single blink
          if (eyeRegionChange > 0.10) {
            blinkCountRef.current++;
            if (blinkCountRef.current >= 1) {
              setBlinkDetected(true);
            }
          }
        }
        
        previousFrameRef.current = currentFrame;
        // Auto-capture trigger: when motion and a blink are detected, treat as face present
        try {
          const nowMs = Date.now();
          if (mode === 'checkin' && movementConsecutiveRef.current >= 2 && blinkCountRef.current >= 1 && !isAutoCheckingRef.current && (nowMs - lastAutoCheckRef.current) > AUTO_CHECK_COOLDOWN) {
            lastAutoCheckRef.current = nowMs;
            setFaceDetected(true);
            autoCheckin().catch(e => { if (import.meta.env.DEV) console.error('autoCheckin error', e); isAutoCheckingRef.current = false; });
          }
        } catch (e) {}
      }, 500);
    };
    
    startLivenessDetection();
    
    return () => {
      if (livenessIntervalRef.current) {
        clearInterval(livenessIntervalRef.current);
      }
    };
  }, [isCheckingLiveness]);

  // ========== ORIGINAL PERFORM LIVENESS CHECK (PRESERVED) ==========
  async function performLivenessCheck() {
    setStatus('Performing liveness detection...');
    setIsCheckingLiveness(true);
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const isLive = movementDetected && blinkDetected;
    
    setIsCheckingLiveness(false);
    
    if (!isLive) {
      let errorMsg = 'Liveness detection failed. ';
      if (!movementDetected) errorMsg += 'No head movement detected. ';
      if (!blinkDetected) errorMsg += 'No eye blink detected. ';
      errorMsg += 'Please look at the camera and blink naturally.';
      setStatus(errorMsg);
      return false;
    }
    
    setStatus('Liveness confirmed! Processing...');
    return true;
  }

  // ========== ORIGINAL SNAPSHOT FUNCTION (PRESERVED) ==========
  function snapshotBlob() {
    return new Promise(resolve => {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      if (!canvas || !video) return resolve(null);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(resolve, 'image/jpeg');
    });
  }

  // Enhanced snapshot: briefly flash screen and brighten pixels before export
  async function enhancedSnapshotBlob({ factor = 1.7, flashMs = 220 } = {}) {
    const video = videoRef.current;
    if (!video) return null;

    // Prevent duplicate captures
    if (isProcessing) return null;
    setIsProcessing(true);

    // show flash overlay so phone screen lights up
    setFlashActive(true);
    await new Promise(r => setTimeout(r, 120));

    // create an offscreen canvas to capture at higher resolution for better low-light detail
    const targetW = 640;
    const targetH = 640;
    const off = document.createElement('canvas');
    off.width = targetW;
    off.height = targetH;
    const ctx = off.getContext('2d');

    // Draw the current video frame scaled into the target canvas
    try {
      ctx.drawImage(video, 0, 0, targetW, targetH);
      // attempt a light brighten pass
      const img = ctx.getImageData(0, 0, targetW, targetH);
      const data = img.data;
      for (let i = 0; i < data.length; i += 4) {
        data[i] = Math.min(255, data[i] * factor);
        data[i+1] = Math.min(255, data[i+1] * factor);
        data[i+2] = Math.min(255, data[i+2] * factor);
      }
      ctx.putImageData(img, 0, 0);
    } catch (e) {
      if (import.meta.env.DEV) console.warn('Brighten failed, continuing with raw capture', e);
      try { ctx.drawImage(video, 0, 0, targetW, targetH); } catch (ee) {}
    }

    // keep flash visible for a short moment so physical screen brightens
    await new Promise(r => setTimeout(r, flashMs));
    setFlashActive(false);

    const blob = await new Promise(resolve => off.toBlob(resolve, 'image/jpeg', 0.9));
    setIsProcessing(false);
    return blob;
  }

  async function postImage(url, formData) {
    // Route API calls to backend (port 3000) when a relative `/api/...` path is supplied
    const backendBase = '';
    let target = url;
    if (url.startsWith('/api/')) target = backendBase + url;
    else if (!url.startsWith('http')) target = backendBase + '/' + url.replace(/^\//, '');

    // Attach Authorization header if token exists (only add headers when present)
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
    const headers = token ? { 'Authorization': `Bearer ${token}` } : null;

    // build fetch options without forcing headers when none are present (avoid corrupting FormData boundaries)
    const fetchOptions = { method: 'POST', body: formData };
    if (headers) fetchOptions.headers = headers;

    // use fetch directly for multipart but guard response parsing
    const res = await fetch(target, fetchOptions);
    if (res.ok) return { ok: true, data: await res.json().catch(() => null) };
    // non-2xx: try json else text
    try { const err = await res.json(); return { ok: false, error: err }; } catch(e) { const txt = await res.text(); return { ok: false, error: txt }; }
  }

  // expose useful internals to parent via ref (if provided)
  useImperativeHandle(ref, () => ({
    video: videoRef.current,
    takeSnapshot: snapshotBlob
  }), [videoRef, snapshotBlob]);

  // client-side verification removed; server performs face matching

  // Frontend face detection removed: server-side processing will handle matching.

  // ========== REGISTER FACE WITH face-api.js ==========
  const handleRegisterWithFaceAPI = async () => {
    const isLive = await performLivenessCheck();
    if (!isLive) return;
    setIsProcessing(true);
    setStatus('📸 Detecting your face and preparing the registration...');

    const descriptor = await getFaceDescriptor();
    if (!descriptor) {
      setStatus('❌ No face detected. Please align your face within the camera frame.');
      setIsProcessing(false);
      return;
    }

    const blob = await enhancedSnapshotBlob({ factor: 1.8, flashMs: 220 });
    if (!blob) {
      setStatus('❌ Capture failed');
      setIsProcessing(false);
      return;
    }

    const fd = new FormData();
    fd.append('reg_number', regNumber || name);
    fd.append('face_descriptor', JSON.stringify(descriptor));
    fd.append('file', blob, 'face.jpg');

    try {
      const r = await postImage('/api/users/register-face', fd);
      if (r.ok) {
        setStatus('✅ Registration submitted. Face descriptor stored successfully.');
        if (onSuccess) onSuccess(r.data);
      } else {
        const errorText = typeof r.error === 'string'
          ? r.error
          : r.error?.message || r.error?.detail || JSON.stringify(r.error);
        setStatus('❌ Registration failed: ' + (errorText || 'Unknown'));
        if (import.meta.env.DEV) console.error('Registration error details:', r.error);
      }
    } catch (e) {
      if (import.meta.env.DEV) console.error('Registration network error', e);
      setStatus('❌ Registration network error');
    } finally {
      setIsProcessing(false);
    }
  };

  // ========== AUTOMATIC CHECK-IN (NEW) ==========
  async function getCurrentPositionPromise() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error('Geolocation unavailable'));
      navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 8000 });
    });
  }

  async function autoCheckin() {
    if (isAutoCheckingRef.current || isProcessing) return;
    isAutoCheckingRef.current = true;
    setIsProcessing(true);

    setStatus('✅ Face detected. Capturing and submitting attendance...');

    // get location (best effort)
    let pos = null;
    try {
      pos = await getCurrentPositionPromise();
    } catch (e) {
      if (import.meta.env.DEV) console.warn('Geolocation failed for auto-checkin', e);
      // proceed without location
    }

    // capture enhanced snapshot (no client-side verification)
    const blob = await enhancedSnapshotBlob({ factor: 1.8, flashMs: 220 });
    if (!blob) {
      setStatus('❌ Auto-checkin capture failed.');
      isAutoCheckingRef.current = false;
      setIsProcessing(false);
      return;
    }

    const fd = new FormData();
    if (pos && pos.coords) {
      fd.append('lat', pos.coords.latitude);
      fd.append('lon', pos.coords.longitude);
    }
    fd.append('reg_number', regNumber || name);
    const descriptor = await getFaceDescriptor();
    if (!descriptor) {
      setStatus('❌ No face detected. Please align your face within the camera frame.');
      isAutoCheckingRef.current = false;
      setIsProcessing(false);
      return;
    }
    fd.append('face_descriptor', JSON.stringify(descriptor));
    fd.append('file', blob, 'face.jpg');

    try {
      const r = await postImage('/api/attendance/checkin', fd);
      if (r.ok) {
        setStatus('✅ Auto check-in successful! Attendance recorded.');
      } else {
        const serverMsg = (typeof r.error === 'string') ? r.error : (r.error && (r.error.message || JSON.stringify(r.error))) || 'Unknown error';
        const isAuth = (r.error && (r.error.status === 403 || (r.error.code && r.error.code === 'FORBIDDEN'))) || (String(serverMsg).toLowerCase().includes('forbid') || String(serverMsg).toLowerCase().includes('permission'));
        if (isAuth) setStatus('❌ Session expired or unauthorized. Please sign out and log in again.');
        else setStatus('❌ Auto check-in failed: ' + serverMsg);
      }
    } catch (e) {
      console.error('Auto checkin error detail:', e);
      const errMsg = e?.message || (e && (e.response?.data?.message || JSON.stringify(e))) || 'Network error';
      setStatus('❌ Auto check-in failed: ' + errMsg);
    } finally {
      // keep `faceDetected` state so UI remains showing the face
      setTimeout(() => { isAutoCheckingRef.current = false; }, AUTO_CHECK_COOLDOWN);
      setIsProcessing(false);
    }
  }

  // ========== ORIGINAL REGISTER FUNCTION (UPDATED to use face-api) ==========
  const handleRegister = async () => {
    if (!name.trim()) { setStatus('Enter name first.'); return; }
    
    // Use face-api registration instead of hash-based
    await handleRegisterWithFaceAPI();
  };

  // ========== ORIGINAL CHECK-IN FUNCTION (PRESERVED & UPDATED) ==========
  const handleCheckin = async () => {
    setStatus('Checking location...');
    
    navigator.geolocation.getCurrentPosition(async (pos) => {
      setStatus('Location obtained. Performing liveness detection...');
      
      const isLive = await performLivenessCheck();
      if (!isLive) return;
      
      
      // Ensure a face is currently detected before capture
      if (!faceDetected) {
        setStatus('❌ No face detected. Please look at the camera.');
        return;
      }
      
      setStatus('Capturing face...');
      // use enhanced snapshot to increase captured brightness on dim devices
      const blob = await enhancedSnapshotBlob({ factor: 1.8, flashMs: 220 });
      if (!blob) { setStatus('Capture failed'); return; }
      
      const fd = new FormData();
      fd.append('lat', pos.coords.latitude);
      fd.append('lon', pos.coords.longitude);
      fd.append('reg_number', regNumber || name);
      const descriptor = await getFaceDescriptor();
      if (!descriptor) {
        setStatus('❌ No face detected. Please align your face within the camera frame.');
        return;
      }
      fd.append('face_descriptor', JSON.stringify(descriptor));
      fd.append('file', blob, 'face.jpg');
      
      try {
        const r = await postImage('/api/attendance/checkin', fd);
        if (r.ok) {
          setStatus('✅ Check-in successful! Attendance recorded.');
        } else {
          // r.error may be a string or an object
          const serverMsg = (typeof r.error === 'string') ? r.error : (r.error && (r.error.message || JSON.stringify(r.error))) || 'Unknown error';
          // if backend returned an auth error shape, help the user
          const isAuth = (r.error && (r.error.status === 403 || (r.error.code && r.error.code === 'FORBIDDEN')) ) || (String(serverMsg).toLowerCase().includes('forbid') || String(serverMsg).toLowerCase().includes('permission'));
          if (isAuth) {
            setStatus('❌ Session expired or unauthorized. Please sign out and log in again.');
          } else {
            setStatus('❌ Check-in failed: ' + serverMsg);
          }
        }
      } catch (e) {
        setStatus('Error: ' + e.message);
      }
    }, (err) => { 
      setStatus('Geolocation error: ' + err.message);
    });
  };

  return (
    <div className="camera-container">
      <div className="camera-preview" style={{width: '100%', maxWidth: '420px'}}>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="video-fill"
          />
          <canvas
            ref={canvasRef}
            className="canvas-fill"
          />

          {/* Full-Bleed SVG Biometric Mask (0..100 box coordinates for reliable scaling) */}
          <svg className="biometric-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <mask id="opay-biometric-mask">
                <rect width="100" height="100" fill="white" />
                <ellipse cx="50" cy="45" rx="24" ry="34" fill="black" />
              </mask>
            </defs>

            <rect width="100" height="100" fill="rgba(15, 23, 42, 0.82)" mask="url(#opay-biometric-mask)" />
          </svg>

          {/* Neon pulse ring */}
          <div className="ring-overlay" aria-hidden="true">
            <div className="ring" />
          </div>

          {/* Dynamic message banner inside preview */}
          <div className="preview-banner" aria-hidden="true">
            <div className="banner-pill">{status || 'Align your face within the frame'}</div>
          </div>

          {/* Fullscreen white flash overlay used to brighten the scene briefly */}
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: 0,
              background: '#ffffff',
              opacity: flashActive ? 0.96 : 0,
              pointerEvents: 'none',
              transition: 'opacity 150ms linear',
              borderRadius: '12px'
            }}
          />
        </div>
      
      {/* Liveness Status Indicators */}
      <div className="liveness-indicators">
        <div className={`indicator ${movementDetected ? 'success' : 'pending'}`}>
          {movementDetected ? '✅' : '⏳'} Head Movement
        </div>
        <div className={`indicator ${blinkDetected ? 'success' : 'pending'}`}>
          {blinkDetected ? '✅' : '⏳'} Eye Blink
        </div>
        <div className={`indicator ${faceDetected ? 'success' : 'pending'}`}>
          {faceDetected ? '✅' : '⏳'} Face Detected
        </div>
        {/* server-side matching: no client-side model */}
      </div>

      <div className="controls">
        {cameraError && (
          <div className="camera-select">
            {devices.length > 0 ? (
              <>
                <label htmlFor="cameraInput">Choose a camera:</label>
                <select
                  id="cameraInput"
                  value={selectedDeviceId || ''}
                  onChange={async e => {
                    const chosenId = e.target.value || null;
                    setSelectedDeviceId(chosenId);
                    await startCamera(chosenId);
                  }}
                >
                  {devices.map((device, index) => (
                    <option key={device.deviceId} value={device.deviceId}>
                      {device.label || `Camera ${index + 1}`}
                    </option>
                  ))}
                </select>
              </>
            ) : (
              <div className="camera-error-message">No camera detected. Connect a webcam and retry.</div>
            )}
            <button type="button" onClick={() => startCamera()}>Retry Camera</button>
          </div>
        )}
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Registration Number / ID"
        />
        
        {mode === 'register' && (
          <button onClick={handleRegister} disabled={isCheckingLiveness || isProcessing}>
            {isProcessing ? '⏳ Registering...' : isCheckingLiveness ? 'Checking Liveness...' : '📸 Register Face'}
          </button>
        )}

        {mode === 'checkin' && (
          <>
            <button onClick={handleCheckin} disabled={isCheckingLiveness}>
              {isCheckingLiveness ? 'Verifying...' : '📍 Check In'}
            </button>
          </>
        )}

        <div id="status" className={
          status.includes('✅') ? 'status-success' : 
          status.includes('Error') || status.includes('❌') ? 'status-error' : 'status-info'
        }>
          {status || 'Ready'}
        </div>
      </div>
      
      <style>{`
        .camera-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 15px;
        }
        .camera-preview {
          position: relative;
          display: inline-block;
        }
        .camera-preview video {
          display: block;
          border-radius: 12px;
          background: #1a1a2e;
        }
        .camera-preview canvas {
          position: absolute;
          top: 0;
          left: 0;
          border-radius: 12px;
        }
        .biometric-svg { position: absolute; inset: 0; width: 100%; height: 100%; z-index: 10; pointer-events: none; }
            .camera-preview {
              position: relative;
              display: block;
              aspect-ratio: 3 / 4;
              overflow: hidden;
              border-radius: 12px;
              background: #0f172a;
              border: 1px solid #0b1220;
            }
            .video-fill {
              position: absolute;
              inset: 0;
              width: 100%;
              height: 100%;
              object-fit: cover;
              transform-origin: center;
            }
            .canvas-fill {
              position: absolute;
              inset: 0;
              width: 100%;
              height: 100%;
              border-radius: 12px;
            }
            .ring-overlay { position: absolute; inset: 0; z-index: 20; display:flex; align-items:center; justify-content:center; pointer-events:none }
            .ring { border-radius: 50%; border: 2px solid rgba(16,185,129,0.9); width: 48%; height: 68%; transform: translateY(-5%); box-shadow: 0 0 15px rgba(52,211,153,0.25); }
            .preview-banner { position: absolute; left: 0; right: 0; bottom: 1.25rem; z-index: 30; display:flex; justify-content:center; pointer-events:none }
            .banner-pill { display:inline-block; background: rgba(15,23,42,0.95); color: white; padding: 8px 14px; border-radius: 20px; font-weight:600; font-size:13px; border:1px solid rgba(255,255,255,0.06); max-width:90%; white-space:nowrap; overflow:hidden; text-overflow:ellipsis }
        .liveness-indicators {
          display: flex;
          gap: 12px;
          margin: 10px 0;
          justify-content: center;
          flex-wrap: wrap;
        }
        .indicator {
          padding: 6px 12px;
          border-radius: 20px;
          font-size: 12px;
          background: #f0f0f0;
          font-weight: 500;
        }
        .indicator.success {
          background: #d4edda;
          color: #155724;
        }
        .indicator.pending {
          background: #fff3cd;
          color: #856404;
        }
        .controls {
          display: flex;
          flex-direction: column;
          gap: 10px;
          width: 100%;
          max-width: 400px;
        }
        .camera-select {
          display: grid;
          gap: 8px;
          margin-bottom: 10px;
        }
        .camera-select label {
          font-size: 12px;
          font-weight: 600;
          color: #cbd5e1;
        }
        .camera-select select {
          width: 100%;
          padding: 10px 12px;
          border-radius: 8px;
          border: 1px solid #e5e7eb;
          background: white;
          color: #111827;
        }
        .camera-select button {
          width: fit-content;
          padding: 10px 16px;
          background: #2563eb;
          color: white;
          border: none;
          border-radius: 8px;
          cursor: pointer;
        }
        .camera-select button:hover:not(:disabled) {
          background: #1d4ed8;
        }
        .controls input {
          padding: 10px 12px;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          font-size: 14px;
        }
        button {
          padding: 12px 24px;
          background: linear-gradient(135deg, #4F46E5, #4338CA);
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s;
        }
        button:hover:not(:disabled) {
          transform: translateY(-1px);
        }
        button:disabled {
          background: #9ca3af;
          cursor: not-allowed;
        }
        .status-success { 
          color: #155724; 
          background: #d4edda; 
          padding: 10px; 
          border-radius: 5px; 
          text-align: center;
        }
        .status-error { 
          color: #721c24; 
          background: #f8d7da; 
          padding: 10px; 
          border-radius: 5px; 
          text-align: center;
        }
        .status-info { 
          color: #004085; 
          background: #cce5ff; 
          padding: 10px; 
          border-radius: 5px; 
          text-align: center;
        }
      `}</style>
    </div>
  );
});

export default CameraApp;