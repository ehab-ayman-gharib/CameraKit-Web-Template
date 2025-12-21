import { useEffect, useRef, useState } from 'react';
import { bootstrapCameraKit, createMediaStreamSource, Transform2D } from '@snap/camera-kit';
import { CAMERAKIT_CONFIG } from '../config/camerakit';

export const CameraKitWrapper = () => {
    // Refs and State
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const sessionRef = useRef<any>(null);
    const cameraKitRef = useRef<any>(null);
    // Media Stream Ref
    const streamRef = useRef<MediaStream | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    // Camera State
    const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
    const [isSessionReady, setIsSessionReady] = useState(false);
    const [capturedImage, setCapturedImage] = useState<string | null>(null);
    const [currentLensId, setCurrentLensId] = useState<string>(CAMERAKIT_CONFIG.DEFAULT_LENS_ID);
    const [showFlash, setShowFlash] = useState(false);
    const [isUsingCamera, setIsUsingCamera] = useState(true);
    const [isRecording, setIsRecording] = useState(false);
    const [recordedVideoUrl, setRecordedVideoUrl] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const recordingChunksRef = useRef<Blob[]>([]);
    const holdTimerRef = useRef<any>(null);


    // Handle lens selection
    const handleSelectLens = (lensId: string) => {
        console.log('Selected lens:', lensId);
        setCurrentLensId(lensId);
    };
    // Handle camera flip
    const handleFlipCamera = () => {
        setIsUsingCamera(true);
        setFacingMode(prev => prev === 'user' ? 'environment' : 'user');
    };

    // Handle Gallery selection
    const handleGalleryClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file || !sessionRef.current) return;

        setIsUsingCamera(false);
        setIsLoading(true);

        try {
            // Stop previous stream
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
            }

            let stream: MediaStream;
            const url = URL.createObjectURL(file);

            if (file.type.startsWith('image/')) {
                const img = new Image();
                img.src = url;
                await new Promise((resolve, reject) => {
                    img.onload = resolve;
                    img.onerror = reject;
                });

                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                ctx?.drawImage(img, 0, 0);
                // @ts-ignore
                stream = canvas.captureStream();
            } else if (file.type.startsWith('video/')) {
                const video = document.createElement('video');
                video.src = url;
                video.muted = true;
                video.loop = true;
                video.playsInline = true;
                await video.play();
                // @ts-ignore
                stream = video.captureStream();
            } else {
                throw new Error('Unsupported file type');
            }

            streamRef.current = stream;
            const source = createMediaStreamSource(stream);
            await sessionRef.current.setSource(source);
            await sessionRef.current.play();

            setIsLoading(false);
        } catch (err: any) {
            console.error('Gallery Error:', err);
            setError(err.message || 'Failed to load gallery media');
            setIsLoading(false);
            setIsUsingCamera(true); // Revert to camera on error
        }
    };
    // Handle take photo / record video
    const handleShutterDown = () => {
        // Start a timer to detect long press (hold)
        holdTimerRef.current = setTimeout(() => {
            startRecording();
        }, 500); // Hold for 500ms to start recording
    };

    const handleShutterUp = () => {
        if (holdTimerRef.current) {
            clearTimeout(holdTimerRef.current);
            holdTimerRef.current = null;
        }

        if (isRecording) {
            stopRecording();
        } else {
            handleTakePhoto();
        }
    };

    const handleTakePhoto = () => {
        if (canvasRef.current) {
            try {
                // Trigger flash
                setShowFlash(true);

                // Capture image
                const dataUrl = canvasRef.current.toDataURL('image/png', 1.0);

                // Show photo after a brief delay to match the flash
                setTimeout(() => {
                    setCapturedImage(dataUrl);
                    setShowFlash(false);
                }, 150);
            } catch (e) {
                console.error("Failed to capture image", e);
                setShowFlash(false);
            }
        }
    };

    const startRecording = () => {
        if (!canvasRef.current) return;

        try {
            // @ts-ignore
            const stream = canvasRef.current.captureStream(30);
            const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });

            mediaRecorderRef.current = recorder;
            recordingChunksRef.current = [];

            recorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    recordingChunksRef.current.push(e.data);
                }
            };

            recorder.onstop = () => {
                const blob = new Blob(recordingChunksRef.current, { type: 'video/webm' });
                const url = URL.createObjectURL(blob);
                setRecordedVideoUrl(url);
                setIsRecording(false);
            };

            recorder.start();
            setIsRecording(true);
        } catch (e) {
            console.error("Failed to start recording", e);
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
        }
    };

    // Handle close photo or video
    const handleClosePreview = () => {
        setCapturedImage(null);
        setRecordedVideoUrl(null);
    };
    // Effects
    useEffect(() => {
        let isMounted = true;
        let session: any;
        // Initialize CameraKit and Session
        const initCameraKit = async () => {
            try {
                const apiToken = CAMERAKIT_CONFIG.API_TOKEN;
                // @ts-ignore
                if (apiToken === 'YOUR_API_TOKEN_HERE' || !apiToken) {
                    console.warn('Camera Kit: Please provide a valid API Token.');
                    if (isMounted) setError('Please configure your API Token in src/components/CameraKitWrapper.tsx');
                    return;
                }

                const cameraKit = await bootstrapCameraKit({ apiToken });
                cameraKitRef.current = cameraKit;
                if (!isMounted) return;

                if (!canvasRef.current) return;

                session = await cameraKit.createSession({ liveRenderTarget: canvasRef.current });
                sessionRef.current = session;

                if (!isMounted) {
                    session.pause();
                    return;
                }

                session.events.addEventListener('error', (event: any) => {
                    console.error('Camera Kit Session Error:', event.detail.error);
                    if (isMounted) setError(event.detail.error.message);
                });

                if (isMounted) {
                    // Set session ready
                    setIsSessionReady(true);
                }

            } catch (err: any) {
                console.error('Camera Kit Initialization Error:', err);
                if (isMounted) setError(err.message || 'Failed to initialize Camera Kit');
            }
        };

        initCameraKit();
        // Cleanup on unmount
        return () => {
            isMounted = false;
            // Cleanup
            if (sessionRef.current) {
                sessionRef.current.pause();
            }
        };
    }, []);
    // Camera Stream Effect
    useEffect(() => {
        if (!isSessionReady || !sessionRef.current || !isUsingCamera) return;
        let isMounted = true;
        // Initialize Camera Stream
        const initStream = async () => {
            try {
                // Stop previous stream if it exists
                if (streamRef.current) {
                    streamRef.current.getTracks().forEach(track => track.stop());
                }

                const stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: facingMode }
                });

                if (!isMounted) {
                    stream.getTracks().forEach(track => track.stop());
                    return;
                }

                streamRef.current = stream;

                const source = createMediaStreamSource(stream, {
                    transform: facingMode === 'user' ? Transform2D.MirrorX : undefined,
                    cameraType: facingMode
                });

                await sessionRef.current.setSource(source);
                await sessionRef.current.play();
                await source.setRenderSize(1080, 1920);

                if (isMounted) {
                    setIsLoading(false);
                }
            } catch (err: any) {
                console.error('Camera Stream Error:', err);
                if (isMounted) setError(err.message || 'Failed to start camera stream');
            }
        };

        initStream();
        // Cleanup on unmount
        return () => {
            isMounted = false;
            // Stop stream
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
            }
        };
    }, [facingMode, isSessionReady, isUsingCamera]);
    // Lens Apply Effect, this effect is responsible for applying the lens to the camera stream
    useEffect(() => {
        if (!isSessionReady || !cameraKitRef.current || !sessionRef.current) return;
        let isMounted = true;

        const applyLens = async () => {
            try {
                // Attempt to remove the current lens before loading the new one
                // We check if the method exists to avoid runtime errors if the SDK version differs
                if (sessionRef.current.removeLens) {
                    console.log('Removing current lens...');
                    await sessionRef.current.removeLens();
                }

                console.log('Loading lens:', currentLensId);
                const lens = await cameraKitRef.current.lensRepository.loadLens(currentLensId, CAMERAKIT_CONFIG.GROUP_ID);

                if (!isMounted) return;

                console.log('Applying lens:', currentLensId);
                await sessionRef.current.applyLens(lens);
                console.log('Lens applied successfully:', currentLensId);
            } catch (e) {
                console.error('Failed to apply lens:', e);
                // If it's the first lens, we might want to retry or show a specific error
                if (isMounted) {
                    // Optional: handle specific error states here
                }
            }
        };

        applyLens();
        // Cleanup on unmount
        return () => {
            isMounted = false;
        };
    }, [currentLensId, isSessionReady]);
    // Error Handling 
    if (error) {
        return (
            <div style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                height: '100vh',
                color: 'red',
                backgroundColor: '#1a1a1a'
            }}>
                <h2>{error}</h2>
            </div>
        );
    }

    return (
        // Camera Container
        <div className="camera-container">
            <canvas
                ref={canvasRef}
                id="CameraKit-AR-Canvas"
                className="camera-canvas"
            />
            {/* Captured Image/Video */}
            {(capturedImage || recordedVideoUrl) && (
                <div className="captured-image-container">
                    {capturedImage ? (
                        <img src={capturedImage} alt="Captured" className="captured-image" />
                    ) : (
                        <video src={recordedVideoUrl!} controls autoPlay loop className="captured-image" />
                    )}
                    <button className="close-button-absolute" onClick={handleClosePreview} aria-label="Close Preview">
                        <svg viewBox="0 0 24 24" width="24" height="24">
                            <path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                        </svg>
                    </button>
                </div>
            )}

            {/* Flash Effect */}
            {showFlash && <div className="flash-overlay" />}

            {/* Loading Overlay */}
            {isLoading && (
                <div className="loading-overlay">
                    <div className="loading-spinner"></div>
                </div>
            )}
            {/* UI Overlay */}
            {(!capturedImage && !recordedVideoUrl) ? (
                <div className="ui-overlay">
                    {/* Top Bar */}
                    <div className="top-bar">
                        <button className="icon-button" aria-label="Flip Camera" onClick={handleFlipCamera}>
                            <svg viewBox="0 0 24 24">
                                <path d="M20 4h-3.17L15 2H9L7.17 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm-5 11.5V13H9v2.5L5.5 12 9 8.5V11h6V8.5l3.5 3.5-3.5 3.5z" />
                            </svg>
                        </button>
                    </div>

                    {/* Bottom Controls */}
                    <div className="bottom-controls">
                        {isRecording && <div className="recording-indicator">REC</div>}
                        <div className="controls-row">
                            <button className="icon-button" aria-label="Gallery" onClick={handleGalleryClick}>
                                <svg viewBox="0 0 24 24">
                                    <path d="M22 16V4c0-1.1-.9-2-2-2H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2zm-11-4l2.03 2.71L16 11l4 5H8l3-4zM2 6v14c0 1.1.9 2 2 2h14v-2H4V6H2z" />
                                </svg>
                            </button>

                            <button
                                className={`shutter-button ${isRecording ? 'recording' : ''}`}
                                aria-label="Take Photo or Record"
                                onMouseDown={handleShutterDown}
                                onMouseUp={handleShutterUp}
                                onTouchStart={handleShutterDown}
                                onTouchEnd={handleShutterUp}
                            >
                                <div className="shutter-inner" />
                            </button>

                            <div className="spacer" />
                        </div>
                    </div>

                    {/* Hidden File Input */}
                    <input
                        type="file"
                        ref={fileInputRef}
                        style={{ display: 'none' }}
                        accept="image/*,video/*"
                        onChange={handleFileChange}
                    />
                </div>
            ) : null}
        </div>
    );
};
