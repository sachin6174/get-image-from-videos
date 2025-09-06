import React, { useState, useRef, useCallback, useEffect } from 'react';
import type { Gender, ProcessingState, EnhancedImage, ExtractedFrame, VideoQueueItem } from './types';
import { filterFrameByGender, enhanceImage } from './services/geminiService';
import Loader from './components/Loader';
import { DownloadIcon, ZipIcon, UploadIcon } from './components/icons';

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
    
    const handleSave = () => {
        onSave(item.id, startTime, endTime);
    };

    const startPercent = duration > 0 ? (startTime / duration) * 100 : 0;
    const endPercent = duration > 0 ? (endTime / duration) * 100 : 0;

    return (
        <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="segment-selector-title">
            <div className="bg-white rounded-xl shadow-2xl border border-gray-200 max-w-2xl w-full p-6 m-4" onClick={e => e.stopPropagation()}>
                <h3 id="segment-selector-title" className="text-lg font-bold text-indigo-600">Select Video Segment</h3>
                <p className="text-sm text-gray-500 truncate mb-4">{item.file.name}</p>

                <video ref={videoRef} src={videoSrc ?? undefined} controls className="w-full rounded-lg bg-black mb-4 aspect-video"></video>

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
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold text-gray-900">Processed Images ({images.length})</h2>
                {images.length > 0 && (
                    <button onClick={downloadAllAsZip} disabled={isZipping} className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-indigo-400 disabled:cursor-not-allowed transition-colors">
                        {isZipping ? <Loader /> : <ZipIcon className="w-5 h-5 mr-2" />}
                        {isZipping ? 'Zipping...' : 'Download All'}
                    </button>
                )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {images.map(image => (
                    <div key={image.id} className="relative group bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm cursor-pointer" onClick={() => onImageClick(image)}>
                        <img src={image.url} alt={`Enhanced frame at ${image.originalTimestamp}`} className="w-full h-40 object-cover transition-transform group-hover:scale-105" />
                         <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-40 transition-all flex items-center justify-center">
                            <div className="p-2 bg-white/20 backdrop-blur-sm rounded-full text-white opacity-0 group-hover:opacity-100 scale-90 group-hover:scale-100 transition-all">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};


// --- Main App Component ---

const App: React.FC = () => {
    const [currentVideo, setCurrentVideo] = useState<VideoQueueItem | null>(null);
    const [genderFilter, setGenderFilter] = useState<Gender>('Female');
    const [shouldColorize, setShouldColorize] = useState<boolean>(true);
    const [processingState, setProcessingState] = useState<ProcessingState>('idle');
    const [enhancedImages, setEnhancedImages] = useState<EnhancedImage[]>([]);
    const [configuringVideo, setConfiguringVideo] = useState<VideoQueueItem | null>(null);
    const [previewingImage, setPreviewingImage] = useState<EnhancedImage | null>(null);

    const handleFileSelect = (file: File) => {
        if (!file.type.startsWith("video/")) return;

        const newItem: VideoQueueItem = {
            id: `${file.name}-${file.lastModified}-${file.size}`,
            file,
            status: 'queued',
            progressMessage: 'Waiting...',
            progressCurrent: 0,
            progressTotal: 1,
            resultCount: 0,
        };

        setCurrentVideo(newItem);
        setEnhancedImages([]);
        setProcessingState('idle');
    };

    const handleRemoveVideo = () => {
        setCurrentVideo(null);
        setEnhancedImages([]);
        setProcessingState('idle');
    };

    const updateCurrentVideo = (updates: Partial<VideoQueueItem>) => {
        setCurrentVideo(prev => (prev ? { ...prev, ...updates } : null));
    };

    const handleSaveConfiguration = (id: string, startTime: number, endTime: number) => {
        updateCurrentVideo({ startTime, endTime });
        setConfiguringVideo(null);
    };

    const startProcessing = useCallback(async () => {
        if (!currentVideo) return;
        
        setProcessingState('processing');
        setEnhancedImages([]);
        
        const item = currentVideo;
        updateCurrentVideo({ status: 'processing', progressMessage: 'Initializing...', resultCount: 0, thumbnailDataUrl: undefined });

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
            setProcessingState('done');
            return;
        }

        const startTime = item.startTime ?? 0;
        const endTime = item.endTime ?? duration;
        const segmentDuration = endTime - startTime;

        if (segmentDuration <= 0) {
            updateCurrentVideo({ status: 'done', resultCount: 0, progressMessage: `Invalid or zero-length segment selected.` });
            URL.revokeObjectURL(videoUrl);
            setProcessingState('done');
            return;
        }

        // 1. Frame Extraction
        const totalFramesToExtract = Math.floor(segmentDuration * 4); // Extract 4 frames per second
        updateCurrentVideo({ progressMessage: 'Step 1/3: Extracting frames...', progressCurrent: 0, progressTotal: totalFramesToExtract });
        
        const extractedFrames: ExtractedFrame[] = [];
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d', { willReadFrequently: true });
        
        await new Promise<void>(resolve => {
            const setupCanvas = () => {
                canvas.width = videoEl.videoWidth;
                canvas.height = videoEl.videoHeight;
                resolve();
            };
            if (videoEl.readyState >= 1) { // HAVE_METADATA
                setupCanvas();
            } else {
                videoEl.onloadedmetadata = setupCanvas;
            }
        });

        for (let j = 0; j < totalFramesToExtract; j++) {
            const timeInSegment = (j / totalFramesToExtract) * segmentDuration;
            const time = startTime + timeInSegment;
            videoEl.currentTime = time;
            await new Promise<void>(resolve => {
                videoEl.onseeked = () => {
                    context?.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
                    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
                    extractedFrames.push({ timestamp: time, dataUrl });
                    updateCurrentVideo({ progressCurrent: j + 1, thumbnailDataUrl: dataUrl });
                    resolve();
                };
            });
        }

        // 2. Face Filtering
        updateCurrentVideo({ progressMessage: `Step 2/3: Filtering for ${genderFilter} faces...`, progressCurrent: 0, progressTotal: extractedFrames.length });
        const filteredFrames: ExtractedFrame[] = [];
        for (let j = 0; j < extractedFrames.length; j++) {
            const frame = extractedFrames[j];
            try {
                const isMatch = await filterFrameByGender(frame.dataUrl, genderFilter);
                if (isMatch) {
                    filteredFrames.push(frame);
                    updateCurrentVideo({ thumbnailDataUrl: frame.dataUrl });
                }
            } catch (filterError) {
                console.error("Filtering error for a frame, skipping:", filterError);
            }
            updateCurrentVideo({ progressCurrent: j + 1 });
        }

        if (filteredFrames.length === 0) {
             updateCurrentVideo({ status: 'done', resultCount: 0, progressMessage: `No ${genderFilter} faces found.` });
             URL.revokeObjectURL(videoUrl);
             setProcessingState('done');
             return;
        }

        // 3. Image Enhancement
        updateCurrentVideo({ progressMessage: `Step 3/3: Enhancing ${filteredFrames.length} images...`, progressCurrent: 0, progressTotal: filteredFrames.length });
        let referenceFrame: ExtractedFrame | undefined = filteredFrames[Math.floor(filteredFrames.length / 2)];
        
        const newImages: EnhancedImage[] = [];
        for (let j = 0; j < filteredFrames.length; j++) {
            const frame = filteredFrames[j];
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
        URL.revokeObjectURL(videoUrl);
        setProcessingState('done');

    }, [currentVideo, genderFilter, shouldColorize]);
    

    if (!currentVideo) {
        return (
            <main className="min-h-screen w-full flex flex-col items-center justify-center p-4">
                <div className="text-center mb-8">
                    <h1 className="text-4xl md:text-5xl font-bold text-gray-900">Get Beautiful Images from Videos</h1>
                    <p className="mt-2 text-lg text-gray-600">Upload a video to extract, filter, and enhance high-quality frames automatically.</p>
                </div>
                <FileInput onFileSelect={handleFileSelect} disabled={processingState === 'processing'} />
            </main>
        );
    }
    
    const progressPercent = currentVideo.progressTotal > 0 ? (currentVideo.progressCurrent / currentVideo.progressTotal) * 100 : 0;
    
    return (
        <div className="container mx-auto p-4 md:p-8 space-y-8">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left Column: Controls & Video Info */}
                <div className="lg:col-span-1 space-y-6">
                    {/* Controls */}
                    <div className="bg-white p-6 rounded-xl shadow-md border border-gray-200">
                        <h3 className="text-lg font-bold text-gray-800 mb-4">Processing Options</h3>
                        
                        {/* Gender Filter */}
                        <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-700 mb-2">Filter for faces:</label>
                            <div className="flex gap-2">
                                {(['Female', 'Male'] as Gender[]).map(g => (
                                    <button key={g} onClick={() => setGenderFilter(g)} disabled={processingState === 'processing'}
                                        className={`w-full py-2 text-sm font-semibold rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 ${genderFilter === g ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
                                    >{g}</button>
                                ))}
                            </div>
                        </div>
                        
                        {/* Colorize Toggle */}
                        <div className="flex items-center justify-between">
                            <label htmlFor="colorize" className="text-sm font-medium text-gray-700">Colorize if needed</label>
                            <button
                                id="colorize"
                                role="switch"
                                aria-checked={shouldColorize}
                                onClick={() => setShouldColorize(!shouldColorize)}
                                disabled={processingState === 'processing'}
                                className={`relative inline-flex items-center h-6 rounded-full w-11 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 ${shouldColorize ? 'bg-indigo-600' : 'bg-gray-200'}`}
                            >
                                <span className={`inline-block w-4 h-4 transform bg-white rounded-full transition-transform ${shouldColorize ? 'translate-x-6' : 'translate-x-1'}`} />
                            </button>
                        </div>
                    </div>

                    {/* Video Info */}
                    <div className="bg-white p-6 rounded-xl shadow-md border border-gray-200">
                        <div className="flex justify-between items-start mb-2">
                            <h3 className="text-lg font-bold text-gray-800 break-all pr-2">{currentVideo.file.name}</h3>
                             <button onClick={handleRemoveVideo} disabled={processingState === 'processing'} className="text-gray-400 hover:text-red-500 transition-colors flex-shrink-0">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>
                         <div className="text-sm text-gray-500 mb-4">{formatBytes(currentVideo.file.size)}</div>

                        <button onClick={() => setConfiguringVideo(currentVideo)} disabled={processingState === 'processing'} className="w-full text-center text-sm text-indigo-600 hover:text-indigo-800 font-semibold mb-4">
                            {currentVideo.startTime !== undefined && currentVideo.endTime !== undefined
                                ? `Segment: ${formatTime(currentVideo.startTime)} - ${formatTime(currentVideo.endTime)} (Click to edit)`
                                : 'Select Segment (Optional)'
                            }
                        </button>

                         {processingState !== 'idle' ? (
                            <div className="space-y-2">
                                <div className="text-sm font-medium text-gray-600">{currentVideo.progressMessage}</div>
                                <div className="w-full bg-gray-200 rounded-full h-2.5">
                                    <div className="bg-indigo-600 h-2.5 rounded-full" style={{ width: `${progressPercent}%` }}></div>
                                </div>
                                <div className="text-xs text-gray-500 text-right">{currentVideo.progressCurrent} / {currentVideo.progressTotal}</div>
                            </div>
                        ) : (
                            <button onClick={startProcessing} className="w-full bg-indigo-600 text-white py-3 rounded-lg font-semibold hover:bg-indigo-700 transition-colors">
                                Start Processing
                            </button>
                        )}
                    </div>
                </div>

                {/* Right Column: Gallery & Preview */}
                <div className="lg:col-span-2">
                    {processingState === 'processing' && currentVideo.thumbnailDataUrl && (
                        <div className="mb-8 p-4 bg-white rounded-xl shadow-md border border-gray-200">
                            <h3 className="text-lg font-bold text-gray-800 mb-4">Live Preview</h3>
                            <img src={currentVideo.thumbnailDataUrl} alt="Processing preview" className="w-full rounded-lg aspect-video object-contain bg-gray-100" />
                        </div>
                    )}
                    <ImageGallery images={enhancedImages} onImageClick={setPreviewingImage} />
                </div>
            </div>

            {configuringVideo && <SegmentSelectorModal item={configuringVideo} onClose={() => setConfiguringVideo(null)} onSave={handleSaveConfiguration} />}
            {previewingImage && <ImagePreviewModal image={previewingImage} onClose={() => setPreviewingImage(null)} />}
        </div>
    );
};

export default App;
