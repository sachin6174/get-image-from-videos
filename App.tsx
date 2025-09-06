import React, { useState, useRef, useCallback, useEffect } from 'react';
import type { Gender, ProcessingState, EnhancedImage, ExtractedFrame, VideoQueueItem } from './types';
import { filterFrameByGender, enhanceImage } from './services/geminiService';
import Loader from './components/Loader';
import { DownloadIcon, ZipIcon, UploadIcon, PlayIcon, ImageIcon, CheckCircleIcon, SearchIcon } from './components/icons';

// Make JSZip available in the window scope for TypeScript
declare global {
    interface Window {
        JSZip: any;
    }
}

const formatBytes = (bytes: number, decimals = 2) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

const formatTime = (totalSeconds: number): string => {
    if (isNaN(totalSeconds) || totalSeconds < 0) return '00:00';
    const seconds = Math.floor(totalSeconds % 60);
    const minutes = Math.floor((totalSeconds / 60) % 60);
    const hours = Math.floor(totalSeconds / 3600);

    const paddedSeconds = seconds.toString().padStart(2, '0');
    const paddedMinutes = minutes.toString().padStart(2, '0');

    if (hours > 0) {
        return `${hours}:${paddedMinutes}:${paddedSeconds}`;
    }
    return `${paddedMinutes}:${paddedSeconds}`;
};


// --- Child Components defined outside the main App component ---

interface SegmentSelectorModalProps {
    item: VideoQueueItem;
    onClose: () => void;
    onSave: (id: string, startTime: number, endTime: number) => void;
}
const SegmentSelectorModal: React.FC<SegmentSelectorModalProps> = ({ item, onClose, onSave }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [duration, setDuration] = useState(0);
    const [startTime, setStartTime] = useState(item.startTime ?? 0);
    const [endTime, setEndTime] = useState(item.endTime ?? 0);
    const [videoSrc, setVideoSrc] = useState<string | null>(null);

    useEffect(() => {
        const url = URL.createObjectURL(item.file);
        setVideoSrc(url);

        const video = document.createElement('video');
        video.src = url;
        video.onloadedmetadata = () => {
            const videoDuration = video.duration;
            setDuration(videoDuration);
            setStartTime(item.startTime ?? 0);
            setEndTime(item.endTime && item.endTime <= videoDuration ? item.endTime : videoDuration);
        };

        return () => {
            URL.revokeObjectURL(url);
        };
    }, [item]);

    const handleTimeChange = (type: 'start' | 'end', value: number) => {
        if (type === 'start') {
            const newStartTime = Math.min(value, endTime);
            setStartTime(newStartTime);
            if (videoRef.current) videoRef.current.currentTime = newStartTime;
        } else {
            const newEndTime = Math.max(value, startTime);
            setEndTime(newEndTime);
            if (videoRef.current) videoRef.current.currentTime = newEndTime;
        }
    };

    const handleSkip = (amount: number) => {
        if (videoRef.current) {
            const newTime = videoRef.current.currentTime + amount;
            // Clamp the new time between 0 and the video's duration
            videoRef.current.currentTime = Math.max(0, Math.min(duration, newTime));
        }
    };
    
    const handleSave = () => {
        onSave(item.id, startTime, endTime);
    };

    const startPercent = duration > 0 ? (startTime / duration) * 100 : 0;
    const endPercent = duration > 0 ? (endTime / duration) * 100 : 0;

    return (
        <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="segment-selector-title">
            <div className="bg-white rounded-xl shadow-2xl border border-gray-200 max-w-4xl w-full p-6 m-4" onClick={e => e.stopPropagation()}>
                <h3 id="segment-selector-title" className="text-lg font-bold text-indigo-600">Select Video Segment</h3>
                <p className="text-sm text-gray-500 truncate mb-4">{item.file.name}</p>

                <video ref={videoRef} src={videoSrc ?? undefined} controls className="w-full rounded-lg bg-black mb-2 aspect-video"></video>
                
                <div className="flex items-center justify-center gap-4 mb-4">
                    <button 
                        onClick={() => handleSkip(-2)} 
                        className="px-4 py-2 bg-gray-100 text-gray-800 hover:bg-gray-200 rounded-lg font-semibold transition-colors flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                        aria-label="Skip backward 2 seconds"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                        </svg>
                        -2s
                    </button>
                    <button 
                        onClick={() => handleSkip(2)} 
                        className="px-4 py-2 bg-gray-100 text-gray-800 hover:bg-gray-200 rounded-lg font-semibold transition-colors flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                        aria-label="Skip forward 2 seconds"
                    >
                        +2s
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                        </svg>
                    </button>
                </div>

                <div className="space-y-3">
                    <div className="relative h-2 rounded-full bg-gray-200">
                         <div className="absolute h-2 rounded-full bg-indigo-500" style={{ left: `${startPercent}%`, right: `${100 - endPercent}%` }}></div>
                         <input type="range" min="0" max={duration} step="any" value={startTime} onChange={e => handleTimeChange('start', parseFloat(e.target.value))} className="absolute w-full h-2 top-0 bg-transparent pointer-events-none appearance-none a-input" />
                         <input type="range" min="0" max={duration} step="any" value={endTime} onChange={e => handleTimeChange('end', parseFloat(e.target.value))} className="absolute w-full h-2 top-0 bg-transparent pointer-events-none appearance-none a-input"/>
                    </div>
                    <style>{`
                        input[type=range].a-input::-webkit-slider-thumb {
                            -webkit-appearance: none;
                            appearance: none;
                            width: 20px;
                            height: 20px;
                            background: #fff;
                            border-radius: 50%;
                            cursor: pointer;
                            border: 3px solid #6366f1;
                            pointer-events: auto;
                        }
                        input[type=range].a-input::-moz-range-thumb {
                           width: 14px;
                           height: 14px;
                           background: #fff;
                           border-radius: 50%;
                           cursor: pointer;
                           border: 3px solid #6366f1;
                           pointer-events: auto;
                        }
                    `}</style>
                    <div className="flex justify-between text-sm font-mono text-gray-700">
                        <div>Start: <span className="font-bold text-indigo-600">{formatTime(startTime)}</span></div>
                        <div>End: <span className="font-bold text-indigo-600">{formatTime(endTime)}</span></div>
                    </div>
                </div>

                <div className="mt-6 flex justify-end gap-3">
                     <button onClick={onClose} className="px-6 py-2 bg-gray-100 text-gray-800 hover:bg-gray-200 rounded-lg font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white focus:ring-gray-400">
                        Cancel
                    </button>
                    <button onClick={handleSave} className="px-6 py-2 bg-indigo-600 text-white hover:bg-indigo-700 rounded-lg font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white focus:ring-indigo-500">
                        Save Segment
                    </button>
                </div>
            </div>
        </div>
    );
};

interface FileInputProps {
    onFileSelect: (file: File) => void;
    disabled: boolean;
}
const FileInput: React.FC<FileInputProps> = ({ onFileSelect, disabled }) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const [isDragging, setIsDragging] = useState(false);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            onFileSelect(e.target.files[0]);
            e.target.value = '';
        }
    };
    const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        if (disabled) return;
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            onFileSelect(e.dataTransfer.files[0]);
        }
    };
    const handleDragOver = (e: React.DragEvent<HTMLLabelElement>) => {
        e.preventDefault();
        e.stopPropagation();
        if (!disabled) {
            setIsDragging(true);
        }
    };
    const handleDragLeave = (e: React.DragEvent<HTMLLabelElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
    };

    return (
        <div className="w-full max-w-4xl mx-auto">
            <label
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                className={`relative group flex flex-col items-center justify-center w-full min-h-[40vh] p-8 text-center bg-white border-2 border-dashed border-gray-300 rounded-2xl cursor-pointer transition-all duration-300 hover:border-indigo-400 hover:bg-gray-50 ${isDragging ? 'border-indigo-500 bg-indigo-50 scale-105' : ''} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
                <div className="flex flex-col items-center justify-center space-y-4 text-gray-600 transition-transform duration-300 group-hover:-translate-y-2">
                    <UploadIcon className="w-16 h-16 text-gray-400" />
                    <p className="text-xl font-semibold">
                        Drop your video here, or <span className="font-bold text-indigo-600">click to browse</span>
                    </p>
                    <p className="text-sm text-gray-500">Supports MP4, WebM, Ogg formats</p>
                </div>
                <input
                    ref={inputRef}
                    type="file"
                    name="file_upload"
                    className="hidden"
                    accept="video/*"
                    onChange={handleFileChange}
                    disabled={disabled}
                />
            </label>
        </div>
    );
};

const downloadImage = (url: string, filename: string) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

interface ImagePreviewModalProps {
    image: EnhancedImage;
    onClose: () => void;
}
const ImagePreviewModal: React.FC<ImagePreviewModalProps> = ({ image, onClose }) => {
    const handleDownload = () => {
        downloadImage(image.url, `enhanced_frame_${image.originalTimestamp.toFixed(2)}.jpg`);
    };

    return (
        <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-md flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-2xl border border-gray-200 max-w-4xl w-full p-4 relative" onClick={e => e.stopPropagation()}>
                <img src={image.url} alt={`Preview of enhanced frame at ${image.originalTimestamp}`} className="w-full h-auto max-h-[75vh] object-contain rounded-lg"/>
                <div className="mt-4 flex justify-center items-center gap-4">
                     <button onClick={onClose} className="px-6 py-2 bg-gray-100 text-gray-800 hover:bg-gray-200 rounded-lg font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white focus:ring-gray-400">
                        Close
                    </button>
                    <button onClick={handleDownload} className="flex items-center px-6 py-2 bg-indigo-600 text-white hover:bg-indigo-700 rounded-lg font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white focus:ring-indigo-500">
                        <DownloadIcon className="w-5 h-5 mr-2" />
                        Download
                    </button>
                </div>
            </div>
        </div>
    );
};


interface ImageGalleryProps {
    images: EnhancedImage[];
    onImageClick: (image: EnhancedImage) => void;
}
const ImageGallery: React.FC<ImageGalleryProps> = ({ images, onImageClick }) => {
    const [isZipping, setIsZipping] = useState(false);

    const downloadAllAsZip = async () => {
        if (!window.JSZip) {
            alert('JSZip library not found.');
            return;
        }
        setIsZipping(true);
        try {
            const zip = new window.JSZip();
            for (let i = 0; i < images.length; i++) {
                const image = images[i];
                const response = await fetch(image.url);
                const blob = await response.blob();
                zip.file(`enhanced_frame_${image.originalTimestamp.toFixed(2)}.jpg`, blob);
            }
            const content = await zip.generateAsync({ type: 'blob' });
            downloadImage(URL.createObjectURL(content), 'enhanced_frames.zip');
        } catch (error) {
            console.error("Failed to create zip file", error);
        } finally {
            setIsZipping(false);
        }
    };

    return (
        <div className="w-full">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-gray-800">Results ({images.length})</h2>
                {images.length > 0 && (
                    <button onClick={downloadAllAsZip} disabled={isZipping} className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-indigo-400 disabled:cursor-not-allowed transition-colors font-semibold">
                        {isZipping ? <Loader /> : <ZipIcon className="w-5 h-5 mr-2" />}
                        {isZipping ? 'Zipping...' : 'Download All'}
                    </button>
                )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {images.map(image => (
                    <div key={image.id} className="relative group bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm cursor-pointer" onClick={() => onImageClick(image)}>
                        <img src={image.url} alt={`Enhanced frame at ${image.originalTimestamp}`} className="w-full h-40 object-cover transition-transform group-hover:scale-105" />
                         <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-40 transition-all flex items-center justify-center">
                            <div className="p-2 bg-white/20 backdrop-blur-sm rounded-full text-white opacity-0 group-hover:opacity-100 scale-90 group-hover:scale-100 transition-all">
                                <SearchIcon className="h-6 w-6" />
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

interface ExtractedFramePreviewModalProps {
    frame: ExtractedFrame;
    onClose: () => void;
}
const ExtractedFramePreviewModal: React.FC<ExtractedFramePreviewModalProps> = ({ frame, onClose }) => (
    <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-md flex items-center justify-center z-50 p-4" onClick={onClose}>
        <div className="bg-white rounded-xl shadow-2xl border border-gray-200 max-w-4xl w-full p-4 relative" onClick={e => e.stopPropagation()}>
            <img src={frame.dataUrl} alt={`Preview of frame at ${frame.timestamp.toFixed(2)}s`} className="w-full h-auto max-h-[75vh] object-contain rounded-lg"/>
            <div className="mt-4 flex justify-center items-center">
                 <button onClick={onClose} className="px-6 py-2 bg-gray-100 text-gray-800 hover:bg-gray-200 rounded-lg font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white focus:ring-gray-400">
                    Close
                </button>
            </div>
        </div>
    </div>
);

interface ExtractedFrameGalleryProps {
    frames: ExtractedFrame[];
    selectedIds: Set<number>;
    onFrameSelect: (timestamp: number) => void;
    onFramePreview: (frame: ExtractedFrame) => void;
    onSelectAll: () => void;
    onDeselectAll: () => void;
}
const ExtractedFrameGallery: React.FC<ExtractedFrameGalleryProps> = ({ frames, selectedIds, onFrameSelect, onFramePreview, onSelectAll, onDeselectAll }) => {
    return (
        <div className="w-full">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-gray-800">Select Frames to Enhance</h2>
                    <p className="text-sm text-gray-500">{frames.length} frames found. {selectedIds.size} selected.</p>
                </div>
                 <div className="flex-shrink-0 flex gap-2">
                    <button onClick={onSelectAll} className="px-3 py-1.5 text-sm font-semibold bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors">Select All</button>
                    <button onClick={onDeselectAll} className="px-3 py-1.5 text-sm font-semibold bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors">Deselect All</button>
                </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {frames.map(frame => {
                    const isSelected = selectedIds.has(frame.timestamp);
                    return (
                        <div key={frame.timestamp} className="relative group bg-white rounded-lg overflow-hidden cursor-pointer" onClick={() => onFrameSelect(frame.timestamp)}>
                            <img src={frame.dataUrl} alt={`Extracted frame at ${frame.timestamp}`} className={`w-full h-40 object-cover transition-transform group-hover:scale-105 border-4 ${isSelected ? 'border-indigo-500' : 'border-transparent'}`} />
                            <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-40 transition-all flex items-center justify-center">
                                <button onClick={(e) => { e.stopPropagation(); onFramePreview(frame); }} className="p-2 bg-white/20 backdrop-blur-sm rounded-full text-white opacity-0 group-hover:opacity-100 scale-90 group-hover:scale-100 transition-all focus:opacity-100">
                                    <SearchIcon className="h-6 w-6" />
                                </button>
                            </div>
                            {isSelected && (
                                <div className="absolute top-2 right-2 text-indigo-500 bg-white rounded-full">
                                    <CheckCircleIcon className="w-6 h-6" />
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>
        </div>
    );
};


// --- Main App Component ---

const App: React.FC = () => {
    const [currentVideo, setCurrentVideo] = useState<VideoQueueItem | null>(null);
    const [shouldColorize, setShouldColorize] = useState<boolean>(true);
    const [framesPerSecond, setFramesPerSecond] = useState<number>(4);
    const [gender, setGender] = useState<Gender>('All');
    const [processingState, setProcessingState] = useState<ProcessingState>('idle');

    const [extractedFrames, setExtractedFrames] = useState<ExtractedFrame[]>([]);
    const [selectedFrameIds, setSelectedFrameIds] = useState<Set<number>>(new Set());
    const [enhancedImages, setEnhancedImages] = useState<EnhancedImage[]>([]);

    const [configuringVideo, setConfiguringVideo] = useState<VideoQueueItem | null>(null);
    const [previewingImage, setPreviewingImage] = useState<EnhancedImage | null>(null);
    const [previewingExtractedFrame, setPreviewingExtractedFrame] = useState<ExtractedFrame | null>(null);

    const handleFileSelect = (file: File) => {
        if (!file.type.startsWith("video/")) return;
        const newItem: VideoQueueItem = {
            id: `${file.name}-${file.lastModified}-${file.size}`, file, status: 'queued',
            progressMessage: 'Waiting...', progressCurrent: 0, progressTotal: 1, resultCount: 0,
        };
        setConfiguringVideo(newItem);
    };

    const handleRemoveVideo = () => {
        setCurrentVideo(null);
        setEnhancedImages([]);
        setExtractedFrames([]);
        setSelectedFrameIds(new Set());
        setProcessingState('idle');
    };

    const updateCurrentVideo = (updates: Partial<VideoQueueItem>) => {
        setCurrentVideo(prev => (prev ? { ...prev, ...updates } : null));
    };

    const handleSaveConfiguration = (id: string, startTime: number, endTime: number) => {
        if (currentVideo && currentVideo.id === id) {
            updateCurrentVideo({ startTime, endTime });
        } else if (configuringVideo) {
            const newVideo = { ...configuringVideo, startTime, endTime };
            setCurrentVideo(newVideo);
            handleRemoveVideo(); // Reset everything else
            setCurrentVideo(newVideo);
        }
        setConfiguringVideo(null);
    };

    const handleExtractFrames = useCallback(async () => {
        if (!currentVideo) return;
        
        setProcessingState('processing');
        setExtractedFrames([]);
        setSelectedFrameIds(new Set());
        setEnhancedImages([]);
        
        const item = currentVideo;
        updateCurrentVideo({ status: 'processing', progressMessage: 'Initializing for extraction...', resultCount: 0, thumbnailDataUrl: undefined });

        const videoUrl = URL.createObjectURL(item.file);
        const videoEl = document.createElement('video');
        videoEl.muted = true;
        videoEl.src = videoUrl;
        
        let duration = 0;
        try {
             duration = await new Promise<number>((resolve, reject) => {
                videoEl.onloadedmetadata = () => resolve(videoEl.duration);
                videoEl.onerror = () => reject('Failed to load video metadata.');
            });
        } catch (e: any) {
            updateCurrentVideo({ status: 'error', error: e.toString() });
            URL.revokeObjectURL(videoUrl);
            setProcessingState('idle');
            return;
        }

        const startTime = item.startTime ?? 0;
        const endTime = item.endTime ?? duration;
        const segmentDuration = endTime - startTime;

        if (segmentDuration <= 0) {
            updateCurrentVideo({ status: 'done', resultCount: 0, progressMessage: `Invalid or zero-length segment selected.` });
            URL.revokeObjectURL(videoUrl);
            setProcessingState('idle');
            return;
        }

        const totalFramesToExtract = Math.floor(segmentDuration * framesPerSecond);
        updateCurrentVideo({ progressMessage: 'Extracting frames...', progressCurrent: 0, progressTotal: totalFramesToExtract });
        
        const frames: ExtractedFrame[] = [];
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d', { willReadFrequently: true });
        
        await new Promise<void>(resolve => {
            const setupCanvas = () => {
                canvas.width = videoEl.videoWidth;
                canvas.height = videoEl.videoHeight;
                resolve();
            };
            if (videoEl.readyState >= 1) { setupCanvas(); } else { videoEl.onloadedmetadata = setupCanvas; }
        });

        for (let j = 0; j < totalFramesToExtract; j++) {
            const timeInSegment = (j / totalFramesToExtract) * segmentDuration;
            const time = startTime + timeInSegment;
            videoEl.currentTime = time;

            const dataUrl = await new Promise<string>(resolve => {
                videoEl.onseeked = () => {
                    context?.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
                    resolve(canvas.toDataURL('image/jpeg', 0.9));
                };
            });
            
            updateCurrentVideo({ progressCurrent: j + 1, thumbnailDataUrl: dataUrl });

            if (gender === 'All') {
                frames.push({ timestamp: time, dataUrl });
            } else {
                updateCurrentVideo({ progressMessage: `Filtering frame ${j + 1} for a ${gender.toLowerCase()} face...` });
                const passesFilter = await filterFrameByGender(dataUrl, gender);
                if (passesFilter) {
                    frames.push({ timestamp: time, dataUrl });
                }
            }
        }
        
        setExtractedFrames(frames);
        updateCurrentVideo({ status: 'queued', progressMessage: `${frames.length} frames found. Ready for selection.` });
        URL.revokeObjectURL(videoUrl);
        setProcessingState('idle');
    }, [currentVideo, framesPerSecond, gender]);

    const handleEnhanceFrames = useCallback(async () => {
        const framesToEnhance = extractedFrames.filter(f => selectedFrameIds.has(f.timestamp));
        if (framesToEnhance.length === 0 || !currentVideo) return;

        setProcessingState('processing');
        setEnhancedImages([]);
        
        updateCurrentVideo({ status: 'processing', progressMessage: `Enhancing ${framesToEnhance.length} images...`, progressCurrent: 0, progressTotal: framesToEnhance.length });
        
        let referenceFrame: ExtractedFrame | undefined = framesToEnhance[Math.floor(framesToEnhance.length / 2)];
        
        const newImages: EnhancedImage[] = [];
        for (let j = 0; j < framesToEnhance.length; j++) {
            const frame = framesToEnhance[j];
            try {
                const enhancedUrl = await enhanceImage(frame.dataUrl, referenceFrame?.dataUrl, shouldColorize);
                if (enhancedUrl) {
                    const newImage = { id: `${frame.timestamp}-${j}`, originalTimestamp: frame.timestamp, url: enhancedUrl };
                    newImages.push(newImage);
                    setEnhancedImages(prev => [...prev, newImage]);
                    updateCurrentVideo({ thumbnailDataUrl: enhancedUrl, resultCount: newImages.length });
                }
            } catch (enhanceError) {
                console.error("Enhancement error for a frame, skipping:", enhanceError);
            }
            updateCurrentVideo({ progressCurrent: j + 1 });
        }

        updateCurrentVideo({ status: 'done', progressMessage: `Processing complete. Found ${newImages.length} images.` });
        setProcessingState('done');

    }, [currentVideo, extractedFrames, selectedFrameIds, shouldColorize]);

    const handleFrameSelection = (timestamp: number) => {
        setSelectedFrameIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(timestamp)) {
                newSet.delete(timestamp);
            } else {
                newSet.add(timestamp);
            }
            return newSet;
        });
    };
    
    const renderInitialView = () => (
        <main className="min-h-screen w-full flex flex-col items-center justify-center p-4 bg-gray-50">
            <div className="text-center mb-8">
                <h1 className="text-4xl md:text-5xl font-bold text-gray-900">Get Beautiful Images from Videos</h1>
                <p className="mt-2 text-lg text-gray-600">Upload a video to extract, select, and enhance high-quality frames.</p>
            </div>
            <FileInput onFileSelect={handleFileSelect} disabled={processingState === 'processing'} />
        </main>
    );

    const renderProcessingView = () => {
        if (!currentVideo) return null;

        const progressPercent = currentVideo.progressTotal > 0 ? (currentVideo.progressCurrent / currentVideo.progressTotal) * 100 : 0;
        const isProcessing = processingState === 'processing';

        return (
            <main className="container mx-auto p-4 md:p-8">
                {/* Header */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8">
                    <div>
                        <h1 className="text-2xl md:text-3xl font-bold text-gray-800 break-all pr-4">{currentVideo.file.name}</h1>
                        <p className="text-sm text-gray-500 mt-1">{formatBytes(currentVideo.file.size)}</p>
                    </div>
                    <button 
                        onClick={handleRemoveVideo} 
                        disabled={isProcessing}
                        className="mt-4 sm:mt-0 flex-shrink-0 px-4 py-2 bg-white text-gray-700 text-sm font-semibold border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
                    >
                        Change Video
                    </button>
                </div>
    
                {/* Main Content Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
                    
                    {/* Left Column: Config Panel */}
                    <div className="lg:col-span-1 bg-white p-6 rounded-xl shadow-lg border border-gray-200 space-y-6 sticky top-8">
                        {extractedFrames.length === 0 ? (
                             <>
                                <h2 className="text-xl font-bold text-gray-800 border-b pb-4">Step 1: Extract Frames</h2>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Video Segment</label>
                                    <button onClick={() => setConfiguringVideo(currentVideo)} disabled={isProcessing} className="w-full flex justify-between items-center text-left p-3 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors">
                                        <div>
                                            <span className="font-mono text-indigo-600">{formatTime(currentVideo.startTime ?? 0)}</span>
                                            <span className="mx-2 text-gray-400">&rarr;</span>
                                            <span className="font-mono text-indigo-600">{formatTime(currentVideo.endTime ?? 0)}</span>
                                        </div>
                                        <span className="text-sm font-semibold text-indigo-600">Edit</span>
                                    </button>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Frames per Second</label>
                                    <p className="text-xs text-gray-500 mb-2">Higher values find more frames but take longer to extract.</p>
                                    <div className="grid grid-cols-4 gap-2">
                                        {[1, 2, 4, 8].map(fps => (
                                            <button key={fps} onClick={() => setFramesPerSecond(fps)} disabled={isProcessing}
                                                className={`w-full py-2 text-sm font-semibold rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 ${framesPerSecond === fps ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}>
                                                {fps}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">AI Face Filter</label>
                                    <p className="text-xs text-gray-500 mb-2">Find frames with a prominent face. 'All' skips this filter.</p>
                                    <div className="grid grid-cols-3 gap-2">
                                        {(['All', 'Male', 'Female'] as Gender[]).map(g => (
                                            <button key={g} onClick={() => setGender(g)} disabled={isProcessing}
                                                className={`w-full py-2 text-sm font-semibold rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 ${gender === g ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}>
                                                {g}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div className="pt-6 border-t border-gray-200">
                                    <button onClick={handleExtractFrames} disabled={isProcessing} className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white py-3 rounded-lg font-semibold hover:bg-indigo-700 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 text-lg disabled:bg-indigo-400">
                                        {isProcessing ? <Loader /> : <PlayIcon className="w-6 h-6" />}
                                        {isProcessing ? 'Extracting...' : 'Extract Frames'}
                                    </button>
                                </div>
                            </>
                        ) : (
                            <>
                                <h2 className="text-xl font-bold text-gray-800 border-b pb-4">Step 2: Enhance Images</h2>
                                <div className="p-3 bg-gray-50 rounded-lg text-center">
                                    <p className="text-sm font-medium text-gray-800">Selected for Enhancement</p>
                                    <p className="text-3xl font-bold text-indigo-600">{selectedFrameIds.size}</p>
                                    <p className="text-xs text-gray-500">of {extractedFrames.length} frames</p>
                                </div>
                                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                    <label htmlFor="colorize" className="text-sm font-medium text-gray-700">Colorize if needed</label>
                                    <button
                                        id="colorize" role="switch" aria-checked={shouldColorize} onClick={() => setShouldColorize(!shouldColorize)} disabled={isProcessing}
                                        className={`relative inline-flex items-center h-6 rounded-full w-11 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 ${shouldColorize ? 'bg-indigo-600' : 'bg-gray-200'}`}
                                    >
                                        <span className={`inline-block w-4 h-4 transform bg-white rounded-full transition-transform ${shouldColorize ? 'translate-x-6' : 'translate-x-1'}`} />
                                    </button>
                                </div>
                                 <div className="pt-6 border-t border-gray-200">
                                    <button onClick={handleEnhanceFrames} disabled={isProcessing || selectedFrameIds.size === 0} className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white py-3 rounded-lg font-semibold hover:bg-indigo-700 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 text-lg disabled:bg-indigo-400 disabled:cursor-not-allowed">
                                        {isProcessing ? <Loader /> : <PlayIcon className="w-6 h-6" />}
                                        {isProcessing ? 'Enhancing...' : `Enhance ${selectedFrameIds.size} Frame${selectedFrameIds.size === 1 ? '' : 's'}`}
                                    </button>
                                </div>
                            </>
                        )}
                        {isProcessing && (
                             <div className="space-y-2 pt-6 border-t">
                                <div className="text-sm font-medium text-gray-600">{currentVideo.progressMessage}</div>
                                <div className="w-full bg-gray-200 rounded-full h-2.5">
                                    <div className="bg-indigo-600 h-2.5 rounded-full transition-all duration-300" style={{ width: `${progressPercent}%` }}></div>
                                </div>
                                <div className="text-xs text-gray-500 text-right">{currentVideo.progressCurrent} / {currentVideo.progressTotal}</div>
                            </div>
                        )}
                    </div>
    
                    {/* Right Column: Results Panel */}
                    <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-lg border border-gray-200 min-h-[60vh] flex flex-col">
                        {isProcessing ? (
                            <div>
                                <h3 className="text-lg font-bold text-gray-800 mb-4">Processing Preview...</h3>
                                {currentVideo.thumbnailDataUrl ? (
                                    <img src={currentVideo.thumbnailDataUrl} alt="Processing preview" className="w-full rounded-lg aspect-video object-contain bg-gray-100" />
                                ) : (
                                    <div className="w-full rounded-lg aspect-video bg-gray-100 flex items-center justify-center"><Loader /></div>
                                )}
                            </div>
                        ) : processingState === 'done' && enhancedImages.length > 0 ? (
                            <ImageGallery images={enhancedImages} onImageClick={setPreviewingImage} />
                        ) : processingState === 'done' && enhancedImages.length === 0 ? (
                            <div className="flex-grow flex flex-col items-center justify-center text-center text-gray-500">
                                <ImageIcon className="w-20 h-20 text-gray-300 mb-4" />
                                <h3 className="text-xl font-semibold">No Results Found</h3>
                                <p className="mt-1 max-w-sm">{currentVideo.progressMessage || `Enhancement did not produce any images.`}</p>
                            </div>
                        ) : extractedFrames.length > 0 ? (
                            <ExtractedFrameGallery 
                                frames={extractedFrames} 
                                selectedIds={selectedFrameIds} 
                                onFrameSelect={handleFrameSelection} 
                                onFramePreview={setPreviewingExtractedFrame} 
                                onSelectAll={() => setSelectedFrameIds(new Set(extractedFrames.map(f => f.timestamp)))}
                                onDeselectAll={() => setSelectedFrameIds(new Set())}
                            />
                        ) : (
                            <div className="flex-grow flex flex-col items-center justify-center text-center text-gray-500">
                                <ImageIcon className="w-20 h-20 text-gray-300 mb-4" />
                                <h3 className="text-xl font-semibold">Ready to Extract</h3>
                                <p className="mt-1">Extracted frames will appear here for you to select.</p>
                            </div>
                        )}
                    </div>
                </div>
            </main>
        );
    };
    
    return (
        <>
            {!currentVideo ? renderInitialView() : renderProcessingView()}
            {configuringVideo && <SegmentSelectorModal item={configuringVideo} onClose={() => setConfiguringVideo(null)} onSave={handleSaveConfiguration} />}
            {previewingImage && <ImagePreviewModal image={previewingImage} onClose={() => setPreviewingImage(null)} />}
            {previewingExtractedFrame && <ExtractedFramePreviewModal frame={previewingExtractedFrame} onClose={() => setPreviewingExtractedFrame(null)} />}
        </>
    );
};

export default App;