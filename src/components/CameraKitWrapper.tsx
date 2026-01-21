import { useEffect, useRef, useState } from 'react';
import { bootstrapCameraKit, createMediaStreamSource, Transform2D, createImageSource, createVideoSource } from '@snap/camera-kit';
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
    const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
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

    // Audio Refs
    const shutterSound = useRef<HTMLAudioElement | null>(null);

    // Initialize Audio
    useEffect(() => {
        shutterSound.current = new Audio('/sounds/shutter.mp3');

        // Preload sounds
        shutterSound.current.load();
    }, []);


    //@ts-ignore
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
            // Stop previous camera stream if it exists
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
                streamRef.current = null;
            }

            const url = URL.createObjectURL(file);

            if (file.type.startsWith('image/')) {
                const img = new Image();
                img.crossOrigin = "anonymous";
                img.src = url;

                await new Promise((resolve, reject) => {
                    img.onload = resolve;
                    img.onerror = reject;
                });

                const imageSource = await createImageSource(img);
                await sessionRef.current.setSource(imageSource.copy());
                await sessionRef.current.play();

            } else if (file.type.startsWith('video/')) {
                const video = document.createElement('video');
                // Set these BEFORE src for better mobile compatibility
                video.muted = true;
                video.loop = true;
                video.playsInline = true;
                (video as any).webkitPlaysInline = true; // For older iOS browsers
                video.crossOrigin = "anonymous";
                video.src = url;

                await new Promise((resolve, reject) => {
                    // canplaythrough is more reliable for mobile to ensure enough data is buffered
                    video.oncanplaythrough = resolve;
                    video.onloadedmetadata = () => {
                        // Ensure dimensions are captured as soon as they are available
                        resolve(null);
                    };
                    video.onerror = (e) => {
                        console.error('Video element error:', e);
                        reject(new Error('Failed to load video file'));
                    };

                    // Cleanup timeout for mobile
                    setTimeout(() => resolve(null), 5000);
                });

                // Optimization for mobile: scale down high-res videos
                const MAX_DIMENSION = 1280;
                if (video.videoWidth > 0 && (video.videoWidth > MAX_DIMENSION || video.videoHeight > MAX_DIMENSION)) {
                    const scale = MAX_DIMENSION / Math.max(video.videoWidth, video.videoHeight);
                    video.width = video.videoWidth * scale;
                    video.height = video.videoHeight * scale;
                } else if (video.videoWidth > 0) {
                    video.width = video.videoWidth;
                    video.height = video.videoHeight;
                }

                // Attempt to play, catching potential autoplay errors
                try {
                    await video.play();
                } catch (e) {
                    console.warn('Autoplay prevented, retrying after interaction if needed', e);
                }

                const videoSource = createVideoSource(video);
                await sessionRef.current.setSource(videoSource.copy());
                await sessionRef.current.play();
            } else {
                throw new Error('Unsupported file type');
            }

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
                // Play shutter sound
                if (shutterSound.current) {
                    shutterSound.current.currentTime = 0;
                    shutterSound.current.play().catch(e => console.warn("Audio play prevented", e));
                }

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

                // Don't hide loader here - let the lens application effect handle it
                // so the loader stays visible until the lens is fully applied
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
                // Show loader while applying lens
                if (isMounted) setIsLoading(true);

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

                // Hide loader after lens is applied
                if (isMounted) setIsLoading(false);
            } catch (e) {
                console.error('Failed to apply lens:', e);
                // Hide loader on error as well
                if (isMounted) {
                    setIsLoading(false);
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
            <div className="flex flex-col justify-center items-center h-screen text-red-600 bg-[#1a1a1a] p-5 text-center">
                <h2 className="text-2xl font-bold mb-4">{error}</h2>
                <button
                    onClick={() => window.location.reload()}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                >
                    Retry
                </button>
            </div>
        );
    }

    return (
        // Camera Container
        <div className="relative w-screen h-screen bg-black overflow-hidden select-none">
            <canvas
                ref={canvasRef}
                id="CameraKit-AR-Canvas"
                className="absolute inset-0 w-full h-full block object-cover z-0"
            />
            {/* Captured Image/Video Preview */}
            {(capturedImage || recordedVideoUrl) && (
                <div className="fixed inset-0 z-50 bg-black animate-photoAppear">
                    {capturedImage ? (
                        <img src={capturedImage} alt="Captured" className="w-full h-full object-cover block" />
                    ) : (
                        <video src={recordedVideoUrl!} controls autoPlay loop className="w-full h-full object-cover block" />
                    )}
                    <button
                        className="absolute top-6 left-6 z-[60] w-11 h-11 flex items-center justify-center bg-black/50 backdrop-blur-lg rounded-full text-white border border-white/20 cursor-pointer pointer-events-auto active:scale-90 transition-all duration-200 p-0"
                        onClick={handleClosePreview}
                        aria-label="Close Preview"
                    >
                        <svg viewBox="0 0 24 24" className="w-6 h-6 fill-current">
                            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                        </svg>
                    </button>
                </div>
            )}

            {/* Flash Effect */}
            {showFlash && <div className="fixed inset-0 bg-white z-[100] pointer-events-none animate-flashAnim" />}

            {/* Loading Overlay */}
            {isLoading && (
                <div className="fixed inset-0 bg-black/30 backdrop-blur-[2px] flex flex-col justify-center items-center z-[2000] text-white">
                    <div className="w-[50px] h-[50px] border-[5px] border-white/30 border-t-white rounded-full animate-spin mb-5"></div>
                </div>
            )}

            {/* UI Overlay */}
            {(!capturedImage && !recordedVideoUrl) ? (
                <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-5 z-10 font-sans">
                    {/* Top Bar */}
                    <div className="flex justify-end pt-2.5 pointer-events-auto">
                        <button
                            className="w-12 h-12 p-0 rounded-full bg-black/40 backdrop-blur-md border-none flex items-center justify-center text-white cursor-pointer transition-all active:scale-95"
                            aria-label="Flip Camera"
                            onClick={handleFlipCamera}
                        >
                            <svg viewBox="0 0 24 24" className="w-6 h-6 fill-current">
                                <path d="M20 4h-3.17L15 2H9L7.17 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm-5 11.5V13H9v2.5L5.5 12 9 8.5V11h6V8.5l3.5 3.5-3.5 3.5z" />
                            </svg>
                        </button>
                    </div>

                    {/* Bottom Controls */}
                    <div className="flex flex-col items-center w-full pb-[30px] pointer-events-auto relative">
                        {isRecording && (
                            <div className="absolute -top-12 left-1/2 -translate-x-1/2 bg-red-600/90 text-white px-3 py-1 rounded font-bold text-xs tracking-widest animate-blink uppercase z-20">
                                REC
                            </div>
                        )}
                        <div className="grid grid-cols-[1fr_auto_1fr] items-center w-full max-w-[440px] px-5 gap-5">
                            <button
                                className="w-12 h-12 p-0 rounded-full bg-black/40 backdrop-blur-md border-none flex items-center justify-center text-white cursor-pointer transition-all active:scale-95"
                                aria-label="Gallery"
                                onClick={handleGalleryClick}
                            >
                                <svg viewBox="0 0 24 24" className="w-6 h-6 fill-current">
                                    <path d="M22 16V4c0-1.1-.9-2-2-2H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2zm-11-4l2.03 2.71L16 11l4 5H8l3-4zM2 6v14c0 1.1.9 2 2 2h14v-2H4V6H2z" />
                                </svg>
                            </button>

                            <button
                                className={`relative w-[76px] h-[76px] p-0 rounded-full border-[3px] flex items-center justify-center cursor-pointer transition-all duration-200 backdrop-blur-[2px] active:scale-90 ${isRecording ? 'border-red-500 bg-red-500/20 shadow-[0_0_0_8px_rgba(255,75,43,0.3)] animate-recordingRipple' : 'border-white/90 bg-white/10 after:content-[""] after:absolute after:inset-0 after:border-2 after:border-white/80 after:rounded-full after:animate-idleRipple'
                                    }`}
                                aria-label="Take Photo or Record"
                                onMouseDown={handleShutterDown}
                                onMouseUp={handleShutterUp}
                                onTouchStart={handleShutterDown}
                                onTouchEnd={handleShutterUp}
                            >
                                <div className={`transition-all duration-300 transform-gpu ${isRecording ? 'w-6 h-6 bg-red-500 rounded-sm' : 'w-[60px] h-[60px] bg-white rounded-full shadow-[0_4px_12px_rgba(0,0,0,0.2)]'
                                    }`} />
                            </button>

                            <div className="w-full" />
                        </div>
                    </div>

                    {/* Hidden File Input */}
                    <input
                        type="file"
                        ref={fileInputRef}
                        className="hidden"
                        accept="image/*,video/*"
                        onChange={handleFileChange}
                    />
                </div>
            ) : null}
        </div>
    );
};
