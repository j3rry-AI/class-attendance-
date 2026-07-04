// src/components/RegisterFace.jsx
import React, { useState, useRef } from 'react';

export default function RegisterFace({ regNumber, onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState('Align your face within the frame');
  const [preview, setPreview] = useState(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [stream, setStream] = useState(null);
  const [devices, setDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState(null);
  const [cameraError, setCameraError] = useState(null);
  
  // Liveness detection state
  const [blinkDetected, setBlinkDetected] = useState(false);
  const [movementDetected, setMovementDetected] = useState(false);
  const [faceDetected, setFaceDetected] = useState(false);
  const [isCheckingLiveness, setIsCheckingLiveness] = useState(false);
  const livenessIntervalRef = useRef(null);
  const previousFrameRef = useRef(null);
  const blinkCountRef = useRef(0);
  const movementConsecutiveRef = useRef(0);
  const [flashActive, setFlashActive] = useState(false);

  // Start camera
  const stopMediaStream = (mediaStream) => {
    if (!mediaStream) return;
    mediaStream.getTracks().forEach(track => track.stop());
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
    const desiredDeviceId = deviceId || selectedDeviceId;
    const constraints = desiredDeviceId
      ? { video: { deviceId: { exact: desiredDeviceId }, width: { ideal: 320 }, height: { ideal: 240 } } }
      : { video: { width: { ideal: 320 }, height: { ideal: 240 } } };

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('Media devices are not available in this browser.');
    }

    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      if (err.name === 'NotFoundError' || err.name === 'OverconstrainedError') {
        if (desiredDeviceId) {
          setSelectedDeviceId(null);
        }
        return await navigator.mediaDevices.getUserMedia({ video: true });
      }
      throw err;
    }
  };

  const startCamera = async (overrideDeviceId = null) => {
    try {
      const cameraInputs = await listCameraDevices();
      if (streamRef.current) {
        stopMediaStream(streamRef.current);
      }

      if (cameraInputs.length === 0) {
        throw new Error('No camera devices found. Connect a camera and reload the page.');
      }

      let deviceIdToUse = overrideDeviceId !== null ? overrideDeviceId : selectedDeviceId;
      if (deviceIdToUse && cameraInputs.every(device => device.deviceId !== deviceIdToUse)) {
        deviceIdToUse = cameraInputs[0].deviceId;
        setSelectedDeviceId(deviceIdToUse);
      }

      const mediaStream = await requestCamera(deviceIdToUse);
      if (streamRef.current) {
        stopMediaStream(streamRef.current);
      }
      streamRef.current = mediaStream;
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
      setCameraError(null);
      setError(null);
    } catch (err) {
      console.warn('Camera startup failed:', err);
      let message = 'Unable to access camera. ' + (err.message || 'Please try again.');
      if (err.name === 'NotAllowedError' || err.name === 'SecurityError') {
        message = 'Camera error: Please allow camera access in your browser.';
      } else if (err.name === 'NotFoundError' || err.name === 'OverconstrainedError') {
        message = 'Camera error: Requested device not found. Please try another camera or reconnect your webcam.';
      }
      setError(message);
      setCameraError(message);
      setDevices(await listCameraDevices());
    }
  };

  // Detect head movement
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
  
  // Detect eye blink
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

  // Start liveness detection loop
  const startLivenessDetection = () => {
    livenessIntervalRef.current = setInterval(() => {
      if (!videoRef.current || isCheckingLiveness) return;
      
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      if (canvas.width === 0 || canvas.height === 0) return;
      
      const ctx = canvas.getContext('2d');
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      
      const currentFrame = ctx.getImageData(0, 0, canvas.width, canvas.height);
      
      if (previousFrameRef.current) {
        const movement = detectMovement(previousFrameRef.current, currentFrame);
        if (movement > 0.035) {
          setMovementDetected(true);
          movementConsecutiveRef.current++;
        } else {
          movementConsecutiveRef.current = 0;
        }
        
        const eyeRegionChange = detectEyeRegionChange(previousFrameRef.current, currentFrame);
        if (eyeRegionChange > 0.10) {
          blinkCountRef.current++;
          if (blinkCountRef.current >= 1) {
            setBlinkDetected(true);
          }
        }
      }
      
      previousFrameRef.current = currentFrame;
      
      // Check if face is detected based on movement and blink
      if (movementConsecutiveRef.current >= 2 && blinkCountRef.current >= 1) {
        setFaceDetected(true);
      }
    }, 500);
  };

  const streamRef = useRef(null);

  React.useEffect(() => {
    startCamera();
    startLivenessDetection();
    return () => {
      stopMediaStream(streamRef.current);
      if (livenessIntervalRef.current) {
        clearInterval(livenessIntervalRef.current);
      }
    };
  }, []);

  // Perform liveness check
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

  // Enhanced snapshot with brightness
  async function enhancedSnapshotBlob({ factor = 1.7, flashMs = 220 } = {}) {
    const video = videoRef.current;
    if (!video) return null;

    setFlashActive(true);
    await new Promise(r => setTimeout(r, 120));

    const targetW = 320;
    const targetH = 320;
    const off = document.createElement('canvas');
    off.width = targetW;
    off.height = targetH;
    const ctx = off.getContext('2d');

    try {
      ctx.drawImage(video, 0, 0, targetW, targetH);
      const img = ctx.getImageData(0, 0, targetW, targetH);
      const data = img.data;
      for (let i = 0; i < data.length; i += 4) {
        data[i] = Math.min(255, data[i] * factor);
        data[i+1] = Math.min(255, data[i+1] * factor);
        data[i+2] = Math.min(255, data[i+2] * factor);
      }
      ctx.putImageData(img, 0, 0);
    } catch (e) {
      try { ctx.drawImage(video, 0, 0, targetW, targetH); } catch (ee) {}
    }

    await new Promise(r => setTimeout(r, flashMs));
    setFlashActive(false);

    const blob = await new Promise(resolve => off.toBlob(resolve, 'image/jpeg', 0.85));
    return blob;
  }

  // Capture photo with liveness check
  const capturePhoto = async () => {
    if (!faceDetected) {
      setStatus('❌ No face detected. Please look at the camera and blink naturally.');
      return;
    }

    const isLive = await performLivenessCheck();
    if (!isLive) return;

    setLoading(true);
    setStatus('📸 Capturing image for registration...');
    
    try {
      const blob = await enhancedSnapshotBlob({ factor: 1.8, flashMs: 220 });
      if (!blob) {
        setStatus('❌ Capture failed. Please try again.');
        setLoading(false);
        return;
      }
      
      const file = new File([blob], 'face.jpg', { type: 'image/jpeg' });
      setPreview(URL.createObjectURL(blob));
      await registerFace(file);
    } catch (err) {
      setStatus('❌ Capture error: ' + err.message);
      setLoading(false);
    }
  };

  // Register face with backend
  const registerFace = async (faceFile) => {
    setStatus('Submitting to server for processing...');
    setError(null);
    
    const formData = new FormData();
    formData.append('reg_number', regNumber);
    formData.append('file', faceFile);
    
    try {
      const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
      
const response = await fetch('/api/users/register-face', {
        method: 'POST',
        body: formData,
        headers
      });
      
      const data = await response.json();
      
      if (response.ok) {
        setStatus('✅ Face registered successfully.');
        setLoading(false);
        if (onSuccess) onSuccess(data);
      } else {
        const errorMsg = data.detail || data.error || 'Registration failed';
        setError(errorMsg);
        setStatus('❌ ' + errorMsg);
        setLoading(false);
        alert('Error: ' + errorMsg);
      }
    } catch (err) {
      setError('Network error: ' + err.message);
      setStatus('❌ Network error. Please try again.');
      setLoading(false);
      alert('Network error: ' + err.message);
    }
  };

  return (
    <div className="face-registration">
      <h3>Register Your Face</h3>
      <p style={{ fontSize: '0.9em', color: '#666', marginBottom: '12px' }}>
        Look at the camera, blink naturally, and keep your head still for a moment.
      </p>
      
      {/* Python Worker Status Warning */}
      
      {/* Camera preview with overlay */}
      {cameraError && devices.length > 0 && (
        <div style={{ marginBottom: '12px', textAlign: 'center' }}>
          <label style={{ display: 'block', marginBottom: '6px', color: '#fff' }} htmlFor="camera-select">
            Select camera device:
          </label>
          <select
            id="camera-select"
            value={selectedDeviceId || ''}
            onChange={e => setSelectedDeviceId(e.target.value)}
            style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #e5e7eb' }}
          >
            {devices.map((device, index) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label || `Camera ${index + 1}`}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={startCamera}
            style={{
              marginTop: '10px',
              padding: '10px 16px',
              borderRadius: '8px',
              border: 'none',
              backgroundColor: '#2563eb',
              color: '#fff',
              cursor: 'pointer'
            }}
          >
            Retry Camera
          </button>
        </div>
      )}
      <div className="camera-preview" style={{
        position: 'relative',
        width: '100%',
        maxWidth: '400px',
        margin: '0 auto',
        borderRadius: '12px',
        overflow: 'hidden',
        backgroundColor: '#000'
      }}>
        <video 
          ref={videoRef} 
          autoPlay 
          playsInline 
          muted
          style={{ width: '100%', display: 'block' }}
        />
        
        {/* Status banner */}
        <div style={{
          position: 'absolute',
          bottom: '12px',
          left: '12px',
          right: '12px',
          backgroundColor: 'rgba(0,0,0,0.7)',
          color: '#fff',
          padding: '8px 12px',
          borderRadius: '6px',
          fontSize: '0.85em',
          textAlign: 'center'
        }}>
          {status}
        </div>

        {/* Flash overlay */}
        <div
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
      
      <canvas ref={canvasRef} style={{ display: 'none' }} />
      
      {/* Liveness Status Indicators */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr 1fr',
        gap: '8px',
        maxWidth: '400px',
        margin: '16px auto'
      }}>
        <div style={{
          padding: '8px',
          borderRadius: '6px',
          textAlign: 'center',
          fontSize: '0.85em',
          backgroundColor: movementDetected ? '#d4edda' : '#f8f9fa',
          color: movementDetected ? '#155724' : '#666'
        }}>
          {movementDetected ? '✅' : '⏳'} Head Movement
        </div>
        <div style={{
          padding: '8px',
          borderRadius: '6px',
          textAlign: 'center',
          fontSize: '0.85em',
          backgroundColor: blinkDetected ? '#d4edda' : '#f8f9fa',
          color: blinkDetected ? '#155724' : '#666'
        }}>
          {blinkDetected ? '✅' : '⏳'} Eye Blink
        </div>
        <div style={{
          padding: '8px',
          borderRadius: '6px',
          textAlign: 'center',
          fontSize: '0.85em',
          backgroundColor: faceDetected ? '#d4edda' : '#f8f9fa',
          color: faceDetected ? '#155724' : '#666'
        }}>
          {faceDetected ? '✅' : '⏳'} Face Detected
        </div>
      </div>
      
      {preview && (
        <div style={{ textAlign: 'center', margin: '16px 0' }}>
          <p style={{ marginBottom: '8px' }}>Captured Photo:</p>
          <img src={preview} alt="Preview" style={{ width: '150px', borderRadius: '8px' }} />
        </div>
      )}
      
      {error && <div style={{
        backgroundColor: '#f8d7da',
        color: '#721c24',
        padding: '12px',
        borderRadius: '6px',
        margin: '12px 0',
        fontSize: '0.9em'
      }}>{error}</div>}
      
      <div className="button-group" style={{ marginTop: '16px', textAlign: 'center' }}>
        <button 
          onClick={capturePhoto} 
          disabled={loading || !faceDetected} 
          style={{
            padding: '10px 24px',
            fontSize: '1em',
            borderRadius: '6px',
            border: 'none',
            backgroundColor: faceDetected ? '#007bff' : '#ccc',
            color: '#fff',
            cursor: faceDetected ? 'pointer' : 'not-allowed',
            transition: 'background-color 200ms'
          }}
        >
          {loading ? 'Registering... Please wait' : '📸 Capture & Register'}
        </button>
      </div>
    </div>
  );
}