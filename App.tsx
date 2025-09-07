import React, { useState, useRef, useCallback, useEffect } from 'react';
import type { Gender, ProcessingState, EnhancedImage, ExtractedFrame, VideoQueueItem } from './types';
import { filterFrameByGender, enhanceImage } from './services/geminiService';
import Loader from './components/Loader';
import { DownloadIcon, ZipIcon, UploadIcon, PlayIcon, ImageIcon, CheckCircleIcon, SearchIcon, CropIcon } from './components/icons';
import ReactCrop, { type Crop, centerCrop, makeAspectCrop } from 'react-image-crop';

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
        return `${hours.toString().padStart(2, '0')}:${paddedMinutes}:${paddedSeconds}`;
    }
    return `${paddedMinutes}:${paddedSeconds}`;
};

// --- Child Components ---

const downloadImage = (url: string, filename: string) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

const downloadFramesAsZip = async (frames: { url: string; filename: string }[], zipFilename: string): Promise<void> => {
    if (!window.JSZip) {
        alert('JSZip library not found.');
        return;
    }
    const zip = new window.JSZip();
    for (const frame of frames) {
        try {
            const response = await fetch(frame.url);
            const blob = await response.blob();
            zip.file(frame.filename, blob);
        } catch (error) {
            console.error(`Failed to fetch and add ${frame.filename} to zip`, error);
        }
    }
    const content = await zip.generateAsync({ type: 'blob' });
    downloadImage(URL.createObjectURL(content), zipFilename);
};

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
    const [startTimeInput, setStartTimeInput] = useState(formatTime(item.startTime ?? 0));
    const [endTimeInput, setEndTimeInput] = useState(formatTime(item.endTime ?? 0));

    useEffect(() => {
        const url = URL.createObjectURL(item.file);
        setVideoSrc(url);
        const video = document.createElement('video');
        video.src = url;
        video.onloadedmetadata = () => {
            const videoDuration = video.duration;
            setDuration(videoDuration);
            const initialStartTime = item.startTime ?? 0;
            const initialEndTime = item.endTime && item.endTime <= videoDuration ? item.endTime : videoDuration;
            setStartTime(initialStartTime);
            setEndTime(initialEndTime);
        };
        return () => URL.revokeObjectURL(url);
    }, [item]);

    useEffect(() => setStartTimeInput(formatTime(startTime)), [startTime]);
    useEffect(() => setEndTimeInput(formatTime(endTime)), [endTime]);

    const handleSliderChange = (type: 'start' | 'end', value: number) => {
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
    
    const parseTime = (timeString: string): number => {
        const cleanedString = timeString.replace(/[^0-9:.]/g, '');
        const parts = cleanedString.split(':').map(part => parseFloat(part)).reverse();
        let seconds = 0;
        if (parts.length > 0 && !isNaN(parts[0])) seconds += parts[0];
        if (parts.length > 1 && !isNaN(parts[1])) seconds += parts[1] * 60;
        if (parts.length > 2 && !isNaN(parts[2])) seconds += parts[2] * 3600;
        return isNaN(seconds) ? 0 : seconds;
    };
    
    const handleTimeInputBlur = (type: 'start' | 'end') => {
        if (type === 'start') {
            let newTime = Math.max(0, Math.min(parseTime(startTimeInput), endTime, duration));
            setStartTime(newTime);
            if (videoRef.current) videoRef.current.currentTime = newTime;
        } else {
            let newTime = Math.min(duration, Math.max(parseTime(endTimeInput), startTime));
            setEndTime(newTime);
            if (videoRef.current) videoRef.current.currentTime = newTime;
        }
    };

    const startPercent = duration > 0 ? (startTime / duration) * 100 : 0;
    const endPercent = duration > 0 ? (endTime / duration) * 100 : 0;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-50" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="segment-selector-title">
            <div className="bg-slate-800 rounded-xl shadow-2xl border border-slate-700 max-w-4xl w-full p-6 m-4" onClick={e => e.stopPropagation()}>
                <h3 id="segment-selector-title" className="text-lg font-bold text-teal-400">Select Video Segment</h3>
                <p className="text-sm text-slate-400 truncate mb-4">{item.file.name}</p>
                <video ref={videoRef} src={videoSrc ?? undefined} controls className="w-full rounded-lg bg-black mb-4 aspect-video"></video>
                <div className="space-y-3">
                    <div className="relative h-2 rounded-full bg-slate-600">
                        <div className="absolute h-2 rounded-full bg-teal-500" style={{ left: `${startPercent}%`, right: `${100 - endPercent}%` }}></div>
                        <input type="range" min="0" max={duration} step="any" value={startTime} onChange={e => handleSliderChange('start', parseFloat(e.target.value))} className="absolute w-full h-2 top-0 bg-transparent pointer-events-none appearance-none a-input" aria-label="Start time"/>
                        <input type="range" min="0" max={duration} step="any" value={endTime} onChange={e => handleSliderChange('end', parseFloat(e.target.value))} className="absolute w-full h-2 top-0 bg-transparent pointer-events-none appearance-none a-input" aria-label="End time"/>
                    </div>
                    <style>{`
                        input[type=range].a-input::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 20px; height: 20px; background: #fff; border-radius: 50%; cursor: pointer; border: 3px solid #14b8a6; pointer-events: auto; }
                        input[type=range].a-input::-moz-range-thumb { width: 14px; height: 14px; background: #fff; border-radius: 50%; cursor: pointer; border: 3px solid #14b8a6; pointer-events: auto; }
                    `}</style>
                    <div className="flex justify-between items-center text-sm font-mono text-slate-300">
                        <div className="flex items-center gap-2"><label htmlFor="startTimeInput" className="font-bold">Start:</label><input id="startTimeInput" type="text" value={startTimeInput} onChange={e => setStartTimeInput(e.target.value)} onBlur={() => handleTimeInputBlur('start')} className="w-24 p-1.5 text-center bg-slate-900 border border-slate-600 rounded-md font-bold text-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-500"/></div>
                        <div className="flex items-center gap-2"><label htmlFor="endTimeInput" className="font-bold">End:</label><input id="endTimeInput" type="text" value={endTimeInput} onChange={e => setEndTimeInput(e.target.value)} onBlur={() => handleTimeInputBlur('end')} className="w-24 p-1.5 text-center bg-slate-900 border border-slate-600 rounded-md font-bold text-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-500"/></div>
                    </div>
                </div>
                <div className="mt-6 flex justify-end gap-3">
                     <button onClick={onClose} className="px-6 py-2 bg-slate-700 text-slate-300 hover:bg-slate-600 rounded-lg font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-500">Cancel</button>
                    <button onClick={() => onSave(item.id, startTime, endTime)} className="px-6 py-2 bg-teal-600 text-white hover:bg-teal-700 rounded-lg font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500">Save Segment</button>
                </div>
            </div>
        </div>
    );
};

interface FileInputProps { onFileSelect: (file: File) => void; disabled: boolean; }
const FileInput: React.FC<FileInputProps> = ({ onFileSelect, disabled }) => {
    const [isDragging, setIsDragging] = useState(false);
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => { if (e.target.files?.[0]) { onFileSelect(e.target.files[0]); e.target.value = ''; } };
    const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); if (!disabled && e.dataTransfer.files?.[0]) onFileSelect(e.dataTransfer.files[0]); };
    const handleDragOver = (e: React.DragEvent<HTMLLabelElement>) => { e.preventDefault(); e.stopPropagation(); if (!disabled) setIsDragging(true); };
    return (
        <div className="w-full max-w-4xl mx-auto">
            <label onDrop={handleDrop} onDragOver={handleDragOver} onDragLeave={() => setIsDragging(false)} className={`relative group flex flex-col items-center justify-center w-full min-h-[40vh] p-8 text-center bg-slate-800/50 border-2 border-dashed border-slate-700 rounded-2xl cursor-pointer transition-all duration-300 hover:border-teal-500 hover:bg-slate-800 ${isDragging ? 'border-teal-500 bg-slate-800 scale-105' : ''} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
                <div className="flex flex-col items-center justify-center space-y-4 text-slate-400 transition-transform duration-300 group-hover:-translate-y-2">
                    <UploadIcon className="w-16 h-16 text-slate-500" />
                    <p className="text-xl font-semibold">Drop your video here, or <span className="font-bold text-teal-400">click to browse</span></p>
                    <p className="text-sm text-slate-500">Supports MP4, WebM, Ogg formats</p>
                </div>
                <input type="file" className="hidden" accept="video/*" onChange={handleFileChange} disabled={disabled} />
            </label>
        </div>
    );
};

interface ImagePreviewModalProps { image: EnhancedImage | ExtractedFrame; onClose: () => void; isEnhanced: boolean; }
const ImagePreviewModal: React.FC<ImagePreviewModalProps> = ({ image, onClose, isEnhanced }) => {
    const url = 'dataUrl' in image ? image.dataUrl : image.url;
    const timestamp = 'originalTimestamp' in image ? image.originalTimestamp : image.timestamp;
    const handleDownload = () => downloadImage(url, `${isEnhanced ? 'enhanced' : 'extracted'}_frame_${timestamp.toFixed(2)}.jpg`);
    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div className="bg-slate-800 rounded-xl shadow-2xl border border-slate-700 max-w-4xl w-full p-4 relative" onClick={e => e.stopPropagation()}>
                <img src={url} alt={`Preview of frame at ${timestamp}`} className="w-full h-auto max-h-[75vh] object-contain rounded-lg"/>
                <div className="mt-4 flex justify-center items-center gap-4">
                     <button onClick={onClose} className="px-6 py-2 bg-slate-700 text-slate-300 hover:bg-slate-600 rounded-lg font-semibold transition-colors">Close</button>
                    {isEnhanced && <button onClick={handleDownload} className="flex items-center px-6 py-2 bg-teal-600 text-white hover:bg-teal-700 rounded-lg font-semibold transition-colors"><DownloadIcon className="w-5 h-5 mr-2" />Download</button>}
                </div>
            </div>
        </div>
    );
};

interface ImageGalleryProps { images: EnhancedImage[]; onImageClick: (image: EnhancedImage) => void; }
const ImageGallery: React.FC<ImageGalleryProps> = ({ images, onImageClick }) => {
    const [isZipping, setIsZipping] = useState(false);
    const downloadAll = async () => {
        setIsZipping(true);
        await downloadFramesAsZip(images.map(img => ({ url: img.url, filename: `enhanced_frame_${img.originalTimestamp.toFixed(2)}.jpg` })), 'enhanced_frames.zip');
        setIsZipping(false);
    };
    return (
        <div className="w-full">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-3xl font-bold text-white">Results ({images.length})</h2>
                {images.length > 0 && <button onClick={downloadAll} disabled={isZipping} className="flex items-center px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:bg-teal-400 font-semibold"><ZipIcon className="w-5 h-5 mr-2" />{isZipping ? 'Zipping...' : 'Download All'}</button>}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {images.map(image => (<div key={image.id} className="relative group bg-slate-700 border border-slate-600 rounded-lg overflow-hidden shadow-sm cursor-pointer" onClick={() => onImageClick(image)}><img src={image.url} alt={`Enhanced frame at ${image.originalTimestamp}`} className="w-full h-40 object-cover transition-transform group-hover:scale-105" /><div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center"><div className="p-2 bg-black/30 backdrop-blur-sm rounded-full text-white opacity-0 group-hover:opacity-100 scale-90 group-hover:scale-100 transition-all"><SearchIcon className="h-6 w-6" /></div></div></div>))}
            </div>
        </div>
    );
};

interface CropImageModalProps { frame: ExtractedFrame; onClose: () => void; onSave: (timestamp: number, newDataUrl: string) => void; }
const CropImageModal: React.FC<CropImageModalProps> = ({ frame, onClose, onSave }) => {
    const imgRef = useRef<HTMLImageElement>(null);
    const [crop, setCrop] = useState<Crop>();
    const [completedCrop, setCompletedCrop] = useState<Crop>();
    const onImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => { const { width, height } = e.currentTarget; setCrop(centerCrop(makeAspectCrop({ unit: '%', width: 90 }, 1, width, height), width, height)); };
    const handleSaveCrop = async () => {
        if (!completedCrop || !imgRef.current) return;
        const image = imgRef.current, canvas = document.createElement('canvas'), scaleX = image.naturalWidth / image.width, scaleY = image.naturalHeight / image.height;
        canvas.width = Math.floor(completedCrop.width * scaleX); canvas.height = Math.floor(completedCrop.height * scaleY);
        const ctx = canvas.getContext('2d'); if (!ctx) return;
        ctx.drawImage(image, Math.floor(completedCrop.x * scaleX), Math.floor(completedCrop.y * scaleY), Math.floor(completedCrop.width * scaleX), Math.floor(completedCrop.height * scaleY), 0, 0, canvas.width, canvas.height);
        onSave(frame.timestamp, canvas.toDataURL('image/jpeg'));
    };
    return (<div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-50 p-4" onClick={onClose}><div className="bg-slate-800 rounded-xl shadow-2xl border border-slate-700 max-w-4xl w-full p-6" onClick={e => e.stopPropagation()}><h3 className="text-lg font-bold text-teal-400 mb-4">Crop Frame</h3><div className="flex justify-center bg-slate-900 p-2 rounded-lg"><ReactCrop crop={crop} onChange={c => setCrop(c)} onComplete={c => setCompletedCrop(c)}><img ref={imgRef} alt="Frame to crop" src={frame.dataUrl} onLoad={onImageLoad} style={{ maxHeight: '60vh', objectFit: 'contain' }} /></ReactCrop></div><div className="mt-6 flex justify-end gap-3"><button onClick={onClose} className="px-6 py-2 bg-slate-700 text-slate-300 hover:bg-slate-600 rounded-lg font-semibold">Cancel</button><button onClick={handleSaveCrop} className="px-6 py-2 bg-teal-600 text-white hover:bg-teal-700 rounded-lg font-semibold">Save Crop</button></div></div></div>);
};

const MAX_SELECTED_FRAMES = 8;
interface ExtractedFrameGalleryProps { frames: ExtractedFrame[]; selectedIds: Set<number>; onFrameSelect: (timestamp: number) => void; onFramePreview: (frame: ExtractedFrame) => void; onFrameCrop: (frame: ExtractedFrame) => void; onSelectAll: () => void; onDeselectAll: () => void; }
const ExtractedFrameGallery: React.FC<ExtractedFrameGalleryProps> = ({ frames, selectedIds, onFrameSelect, onFramePreview, onFrameCrop, onSelectAll, onDeselectAll }) => {
    const isSelectionLimited = selectedIds.size >= MAX_SELECTED_FRAMES;
    const [isZipping, setIsZipping] = useState(false);
    const downloadAll = async () => {
        setIsZipping(true);
        await downloadFramesAsZip(frames.map(f => ({ url: f.dataUrl, filename: `extracted_frame_${f.timestamp.toFixed(2)}.jpg` })), 'extracted_frames.zip');
        setIsZipping(false);
    };
    return (
        <div className="w-full">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
                <div><h2 className="text-3xl font-bold text-white">Select Frames to Enhance</h2><p className="text-sm text-slate-400">{frames.length} frames found. {selectedIds.size} / {MAX_SELECTED_FRAMES} selected.</p></div>
                <div className="flex-shrink-0 flex gap-2"><button onClick={onSelectAll} className="px-3 py-1.5 text-sm font-semibold bg-slate-700 text-slate-300 rounded-md hover:bg-slate-600">Select All</button><button onClick={onDeselectAll} className="px-3 py-1.5 text-sm font-semibold bg-slate-700 text-slate-300 rounded-md hover:bg-slate-600">Deselect All</button><button onClick={downloadAll} disabled={isZipping} className="flex items-center px-3 py-1.5 text-sm font-semibold bg-teal-500/20 text-teal-300 rounded-md hover:bg-teal-500/30 disabled:opacity-50"><ZipIcon className="w-4 h-4 mr-1.5" />{isZipping ? 'Zipping...' : 'Download All'}</button></div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {frames.map(frame => {
                    const isSelected = selectedIds.has(frame.timestamp);
                    return (<div key={frame.timestamp} className={`relative group bg-slate-700 rounded-lg overflow-hidden ${!isSelected && isSelectionLimited ? 'cursor-not-allowed' : 'cursor-pointer'}`} onClick={() => onFrameSelect(frame.timestamp)}>
                        <img src={frame.dataUrl} alt={`Extracted frame at ${frame.timestamp}`} className={`w-full h-40 object-cover transition-transform group-hover:scale-105 border-4 ${isSelected ? 'border-teal-500' : 'border-slate-700'} ${!isSelected && isSelectionLimited ? 'opacity-50' : ''}`} />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center gap-2">
                            <button onClick={(e) => { e.stopPropagation(); onFramePreview(frame); }} className="p-2 bg-black/30 backdrop-blur-sm rounded-full text-white opacity-0 group-hover:opacity-100 scale-90 group-hover:scale-100 transition-all focus:opacity-100" aria-label="Preview frame"><SearchIcon className="h-6 w-6" /></button>
                            <button onClick={(e) => { e.stopPropagation(); onFrameCrop(frame); }} className="p-2 bg-black/30 backdrop-blur-sm rounded-full text-white opacity-0 group-hover:opacity-100 scale-90 group-hover:scale-100 transition-all focus:opacity-100" aria-label="Crop frame"><CropIcon className="h-6 w-6" /></button>
                        </div>
                        {isSelected && (<div className="absolute top-2 right-2 text-teal-400 bg-slate-800 rounded-full"><CheckCircleIcon className="w-6 h-6" /></div>)}
                    </div>)
                })}
            </div>
        </div>
    );
};

// --- Main App Component ---
const App: React.FC = () => {
    const [currentVideo, setCurrentVideo] = useState<VideoQueueItem | null>(null);
    const [videoSrc, setVideoSrc] = useState<string | null>(null);
    const [shouldColorize, setShouldColorize] = useState<boolean>(true);
    const [framesPerSecond, setFramesPerSecond] = useState<number>(4);
    const [gender, setGender] = useState<Gender>('All');
    const [processingState, setProcessingState] = useState<ProcessingState>('idle');
    const [extractedFrames, setExtractedFrames] = useState<ExtractedFrame[]>([]);
    const [selectedFrameIds, setSelectedFrameIds] = useState<Set<number>>(new Set());
    const [enhancedImages, setEnhancedImages] = useState<EnhancedImage[]>([]);
    const [framesBeingEnhanced, setFramesBeingEnhanced] = useState<ExtractedFrame[]>([]);
    const [configuringVideo, setConfiguringVideo] = useState<VideoQueueItem | null>(null);
    const [previewingImage, setPreviewingImage] = useState<EnhancedImage | ExtractedFrame | null>(null);
    const [croppingFrame, setCroppingFrame] = useState<ExtractedFrame | null>(null);
    const isCancelledRef = useRef(false);
    const videoPreviewRef = useRef<HTMLVideoElement>(null);
    const isProcessing = processingState === 'processing';

    const resetProcessingResults = () => {
        setExtractedFrames([]);
        setSelectedFrameIds(new Set());
        setEnhancedImages([]);
        setFramesBeingEnhanced([]);
    };

    const resetStateForNewVideo = () => {
        resetProcessingResults();
        setProcessingState('idle');
    };
    
    const handleFileSelect = (file: File) => {
        if (!file.type.startsWith("video/")) {
            alert("Please select a valid video file.");
            return;
        }

        if (videoSrc) {
            URL.revokeObjectURL(videoSrc);
            setVideoSrc(null);
        }
    
        const newVideoUrl = URL.createObjectURL(file);
        const tempVideo = document.createElement('video');
        tempVideo.src = newVideoUrl;
    
        const cleanupAndProceed = (duration: number | null) => {
            if (duration !== null) {
                const newItem: VideoQueueItem = {
                    id: `${file.name}-${file.lastModified}`,
                    file,
                    status: 'queued',
                    progressMessage: 'Waiting...',
                    progressCurrent: 0,
                    progressTotal: 1,
                    resultCount: 0,
                    startTime: 0,
                    endTime: duration,
                };
                setCurrentVideo(newItem);
                setConfiguringVideo(newItem);
                setVideoSrc(newVideoUrl);
                resetStateForNewVideo();
            } else {
                alert('Could not read video metadata. The file might be corrupt or in an unsupported format.');
                URL.revokeObjectURL(newVideoUrl);
            }
    
            tempVideo.removeEventListener('loadedmetadata', onMetadataLoaded);
            tempVideo.removeEventListener('error', onError);
        };
        
        const onMetadataLoaded = () => {
            cleanupAndProceed(tempVideo.duration);
        };
    
        const onError = () => {
            cleanupAndProceed(null);
        };
    
        tempVideo.addEventListener('loadedmetadata', onMetadataLoaded);
        tempVideo.addEventListener('error', onError);
    };

    const handleRemoveVideo = () => {
        if (videoSrc) {
            URL.revokeObjectURL(videoSrc);
        }
        setVideoSrc(null);
        setCurrentVideo(null);
        resetStateForNewVideo();
    };
    const updateCurrentVideo = (updates: Partial<VideoQueueItem>) => setCurrentVideo(prev => (prev ? { ...prev, ...updates } : null));
    const handleSaveConfiguration = (id: string, startTime: number, endTime: number) => {
        if (currentVideo && currentVideo.id === id) updateCurrentVideo({ startTime, endTime });
        setConfiguringVideo(null);
    };
    const handleSaveCrop = (timestamp: number, newDataUrl: string) => {
        setExtractedFrames(prev => prev.map(f => f.timestamp === timestamp ? { ...f, dataUrl: newDataUrl } : f));
        setCroppingFrame(null);
    };
    const handleCancel = () => { isCancelledRef.current = true; updateCurrentVideo({ progressMessage: 'Cancelling...' }); };

    const handleExtractFrames = useCallback(async () => {
        if (!currentVideo || !videoPreviewRef.current || !videoSrc) return;
        isCancelledRef.current = false;
        setProcessingState('processing');
        resetProcessingResults();
        updateCurrentVideo({ status: 'processing', progressMessage: 'Initializing...', resultCount: 0, thumbnailDataUrl: undefined });

        const videoEl = videoPreviewRef.current;
        videoEl.muted = true;

        const cleanup = () => {
            setProcessingState('idle');
        };

        try {
            if (videoEl.readyState < videoEl.HAVE_METADATA) {
                await new Promise<void>((resolve, reject) => {
                    videoEl.onloadedmetadata = () => resolve();
                    videoEl.onerror = () => reject('Failed to load video metadata.');
                });
            }
        } catch (e: any) {
            updateCurrentVideo({ status: 'error', error: e.toString() });
            cleanup();
            return;
        }

        const startTime = currentVideo.startTime ?? 0;
        const endTime = currentVideo.endTime ?? videoEl.duration;
        const segmentDuration = endTime - startTime;

        if (segmentDuration <= 0) {
            updateCurrentVideo({ status: 'done', progressMessage: `Invalid segment selected.` });
            cleanup();
            return;
        }
        
        const frameInterval = 1 / framesPerSecond;
        const totalFramesToProcess = Math.floor(segmentDuration / frameInterval);

        updateCurrentVideo({ progressMessage: `Analyzing video...`, progressCurrent: 0, progressTotal: totalFramesToProcess });
        
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) {
             updateCurrentVideo({ status: 'error', error: 'Could not create canvas context.' });
             cleanup();
             return;
        }

        canvas.width = videoEl.videoWidth;
        canvas.height = videoEl.videoHeight;
        
        let foundFramesCount = 0;

        const seekPromise = (time: number): Promise<void> => new Promise((resolve, reject) => {
            const onSeeked = () => {
                videoEl.removeEventListener('seeked', onSeeked);
                videoEl.removeEventListener('error', onError);
                resolve();
            };
            const onError = (e: Event) => {
                videoEl.removeEventListener('seeked', onSeeked);
                videoEl.removeEventListener('error', onError);
                reject(`Error seeking video to ${time}: ${e}`);
            };
            videoEl.addEventListener('seeked', onSeeked);
            videoEl.addEventListener('error', onError);
            videoEl.currentTime = time;
        });

        for (let i = 0; i < totalFramesToProcess; i++) {
            if (isCancelledRef.current) break;
            
            const currentTime = startTime + (i * frameInterval);
            updateCurrentVideo({
                progressMessage: `Processing frame ${i + 1} of ${totalFramesToProcess}...`,
                progressCurrent: i
            });
        
            try {
                await seekPromise(currentTime);
                
                context.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
                const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
                updateCurrentVideo({ thumbnailDataUrl: dataUrl });
        
                if (await filterFrameByGender(dataUrl, gender)) {
                    foundFramesCount++;
                    const newFrame: ExtractedFrame = { timestamp: currentTime, dataUrl };
                    setExtractedFrames(prev => [...prev, newFrame]);
                    updateCurrentVideo({ resultCount: foundFramesCount });
                }
            } catch (err) {
                console.error(`Failed to process frame at ${currentTime}s:`, err);
                // Continue to the next frame
            }
        }

        // --- Finalize ---
        updateCurrentVideo({
            status: 'queued',
            progressMessage: `${isCancelledRef.current ? 'Processing cancelled' : 'Processing complete'}. ${foundFramesCount} frames found.`
        });
        cleanup();
    }, [currentVideo, framesPerSecond, gender, videoSrc]);

    const handleEnhanceFrames = useCallback(async () => {
        const framesToEnhance = extractedFrames.filter(f => selectedFrameIds.has(f.timestamp));
        if (framesToEnhance.length === 0 || !currentVideo) return;
        isCancelledRef.current = false; setProcessingState('processing'); setEnhancedImages([]); setFramesBeingEnhanced(framesToEnhance);
        updateCurrentVideo({ status: 'processing', progressMessage: `Enhancing ${framesToEnhance.length} images...`, progressCurrent: 0, progressTotal: framesToEnhance.length });
        
        let referenceFrame: ExtractedFrame | undefined = framesToEnhance[Math.floor(framesToEnhance.length / 2)];
        const newImages: EnhancedImage[] = [];
        for (let j = 0; j < framesToEnhance.length; j++) {
            if (isCancelledRef.current) break;
            const frame = framesToEnhance[j];
            try {
                const enhancedUrl = await enhanceImage(frame.dataUrl, referenceFrame?.dataUrl, shouldColorize);
                if (enhancedUrl) {
                    const newImage = { id: `${frame.timestamp}-${j}`, originalTimestamp: frame.timestamp, url: enhancedUrl };
                    newImages.push(newImage); setEnhancedImages(prev => [...prev, newImage]);
                    updateCurrentVideo({ thumbnailDataUrl: enhancedUrl, resultCount: newImages.length });
                }
            } catch (enhanceError) { console.error("Enhancement error for a frame:", enhanceError); }
            updateCurrentVideo({ progressCurrent: j + 1 });
        }
        updateCurrentVideo({ status: 'done', progressMessage: `${isCancelledRef.current ? 'Processing cancelled' : 'Processing complete'}. Found ${newImages.length} images.` });
        setProcessingState('done');
    }, [currentVideo, extractedFrames, selectedFrameIds, shouldColorize]);

    const handleFrameSelection = (timestamp: number) => {
        setSelectedFrameIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(timestamp)) { newSet.delete(timestamp); }
            else if (newSet.size < MAX_SELECTED_FRAMES) { newSet.add(timestamp); }
            else { alert(`You can only select a maximum of ${MAX_SELECTED_FRAMES} frames.`); }
            return newSet;
        });
    };
    
    const renderInitialView = () => (
        <main className="min-h-screen w-full flex flex-col items-center justify-center p-4 bg-slate-900">
            <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-slate-900 via-slate-900 to-teal-900/40 opacity-50"></div>
            <div className="relative text-center mb-8">
                <h1 className="text-4xl md:text-5xl font-bold text-white">Get Beautiful Images from Videos</h1>
                <p className="mt-2 text-lg text-slate-400">Upload a video to extract, select, and enhance high-quality frames.</p>
            </div>
            <FileInput onFileSelect={handleFileSelect} disabled={processingState === 'processing'} />
        </main>
    );

    const renderProcessingView = () => {
        if (!currentVideo) return null;
        const progressPercent = currentVideo.progressTotal > 0 ? (currentVideo.progressCurrent / currentVideo.progressTotal) * 100 : 0;

        return (
            <div className="min-h-screen bg-slate-800 flex">
                {/* Sidebar */}
                <aside className="w-96 bg-slate-900/80 backdrop-blur-sm border-r border-slate-700 p-6 flex flex-col justify-between sticky top-0 h-screen">
                    <div>
                        <div className="mb-8">
                            <h1 className="text-xl font-bold text-white break-words">{currentVideo.file.name}</h1>
                            <p className="text-sm text-slate-400 mt-1">{formatBytes(currentVideo.file.size)}</p>
                        </div>
                        {extractedFrames.length === 0 ? (
                             <>
                                <h2 className="text-lg font-semibold text-white mb-4">Step 1: Extract Frames</h2>
                                <div className="space-y-5">
                                    <div><label className="block text-sm font-medium text-slate-300 mb-2">Video Segment</label><button onClick={() => setConfiguringVideo(currentVideo)} disabled={isProcessing} className="w-full flex justify-between items-center text-left p-3 bg-slate-800 border border-slate-700 rounded-lg hover:bg-slate-700"><span className="font-mono text-teal-400">{formatTime(currentVideo.startTime ?? 0)} &rarr; {formatTime(currentVideo.endTime ?? 0)}</span><span className="text-sm font-semibold text-teal-400">Edit</span></button></div>
                                    <div><label className="block text-sm font-medium text-slate-300 mb-2">Frames per Second</label><div className="grid grid-cols-5 gap-2">{[1, 2, 4, 8, 24].map(fps => (<button key={fps} onClick={() => setFramesPerSecond(fps)} disabled={isProcessing} className={`w-full py-2 text-sm font-semibold rounded-lg transition-colors ${framesPerSecond === fps ? 'bg-teal-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>{fps === 24 ? 'Max' : fps}</button>))}</div></div>
                                    <div><label className="block text-sm font-medium text-slate-300 mb-2">AI Face Filter</label><div className="grid grid-cols-3 gap-2">{(['All', 'Male', 'Female'] as Gender[]).map(g => (<button key={g} onClick={() => setGender(g)} disabled={isProcessing} className={`w-full py-2 text-sm font-semibold rounded-lg transition-colors ${gender === g ? 'bg-teal-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>{g}</button>))}</div></div>
                                </div>
                            </>
                        ) : (
                            <>
                                <h2 className="text-lg font-semibold text-white mb-4">Step 2: Enhance Images</h2>
                                <div className="space-y-5">
                                    <div className="p-4 bg-slate-800 rounded-lg text-center"><p className="text-sm font-medium text-slate-300">Selected</p><p className="text-3xl font-bold text-teal-400">{selectedFrameIds.size}<span className="text-xl text-slate-500 font-medium"> / {MAX_SELECTED_FRAMES}</span></p></div>
                                    <div className="flex items-center justify-between p-3 bg-slate-800 rounded-lg"><label htmlFor="colorize" className="text-sm font-medium text-slate-300">Colorize if needed</label><button id="colorize" role="switch" aria-checked={shouldColorize} onClick={() => setShouldColorize(!shouldColorize)} disabled={isProcessing} className={`relative inline-flex items-center h-6 rounded-full w-11 transition-colors ${shouldColorize ? 'bg-teal-600' : 'bg-slate-700'}`}><span className={`inline-block w-4 h-4 transform bg-white rounded-full transition-transform ${shouldColorize ? 'translate-x-6' : 'translate-x-1'}`} /></button></div>
                                </div>
                            </>
                        )}
                    </div>
                    <div>
                        {isProcessing ? (
                             <div className="space-y-3 pt-6 border-t border-slate-700">
                                <div className="flex justify-between items-baseline"><div className="text-sm font-medium text-slate-400">{currentVideo.progressMessage}</div><div className="text-xs text-slate-500 font-mono">{currentVideo.progressCurrent}/{currentVideo.progressTotal}</div></div>
                                <div className="w-full bg-slate-700 rounded-full h-2.5"><div className="bg-gradient-to-r from-teal-500 to-fuchsia-500 h-2.5 rounded-full transition-all" style={{ width: `${progressPercent}%` }}></div></div>
                                <button onClick={handleCancel} className="w-full mt-2 px-4 py-2 bg-red-500/20 text-red-400 text-sm font-semibold rounded-lg hover:bg-red-500/30">Cancel</button>
                            </div>
                        ) : extractedFrames.length === 0 ? (
                            <button onClick={handleExtractFrames} className="w-full flex items-center justify-center gap-2 bg-teal-600 text-white py-3 rounded-lg font-semibold hover:bg-teal-700 text-lg"><PlayIcon className="w-6 h-6" />Extract Frames</button>
                        ) : (
                             <button onClick={handleEnhanceFrames} disabled={selectedFrameIds.size === 0} className="w-full flex items-center justify-center gap-2 bg-teal-600 text-white py-3 rounded-lg font-semibold hover:bg-teal-700 text-lg disabled:bg-teal-600/50 disabled:cursor-not-allowed"><PlayIcon className="w-6 h-6" />Enhance {selectedFrameIds.size} Frame{selectedFrameIds.size === 1 ? '' : 's'}</button>
                        )}
                        <button onClick={handleRemoveVideo} disabled={isProcessing} className="w-full mt-3 text-sm text-slate-400 hover:text-teal-400 font-semibold disabled:opacity-50">Change Video</button>
                    </div>
                </aside>

                {/* Main Content */}
                <main className="flex-1 p-8 overflow-y-auto">
                    {isProcessing && framesBeingEnhanced.length > 0 ? (
                        <div>
                            <h3 className="text-3xl font-bold text-white mb-4">Enhancing {framesBeingEnhanced.length} Frames...</h3>
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                {framesBeingEnhanced.map(frame => {
                                    const enhancedVersion = enhancedImages.find(img => img.originalTimestamp === frame.timestamp);
                                    return (<div key={frame.timestamp} className="relative group bg-slate-700 border border-slate-600 rounded-lg overflow-hidden shadow-sm"><img src={enhancedVersion ? enhancedVersion.url : frame.dataUrl} alt={`Frame at ${frame.timestamp.toFixed(2)}s`} className="w-full h-40 object-cover" />{!enhancedVersion ? (<div className="absolute inset-0 bg-black/60 flex items-center justify-center"><Loader /></div>) : (<div className="absolute top-2 right-2 text-green-400 bg-black/50 rounded-full p-0.5"><CheckCircleIcon className="w-5 h-5" /></div>)}</div>);
                                })}
                            </div>
                        </div>
                    ) : processingState === 'done' ? (
                        enhancedImages.length > 0 ? <ImageGallery images={enhancedImages} onImageClick={(img) => setPreviewingImage(img)} />
                        : (<div className="flex-grow flex flex-col items-center justify-center text-center text-slate-400 min-h-[80vh]"><ImageIcon className="w-20 h-20 text-slate-600 mb-4" /><h3 className="text-xl font-semibold">No Results Found</h3><p className="mt-1 max-w-sm">{currentVideo.progressMessage}</p></div>)
                    ) : extractedFrames.length > 0 ? (
                        <ExtractedFrameGallery frames={extractedFrames} selectedIds={selectedFrameIds} onFrameSelect={handleFrameSelection} onFramePreview={(frame) => setPreviewingImage(frame)} onFrameCrop={setCroppingFrame} onSelectAll={() => setSelectedFrameIds(new Set(extractedFrames.slice(0, MAX_SELECTED_FRAMES).map(f => f.timestamp)))} onDeselectAll={() => setSelectedFrameIds(new Set())} />
                    ) : (
                        currentVideo &&
                        <div className="flex-grow flex flex-col items-center justify-center text-center min-h-[80vh]">
                            <h3 className="text-2xl font-bold text-white mb-4">
                                {isProcessing ? 'Extracting Frames...' : 'Video Preview'}
                            </h3>
                            {isProcessing && currentVideo.thumbnailDataUrl ? (
                                <img src={currentVideo.thumbnailDataUrl} alt="Filtering preview" className="w-full max-w-4xl rounded-lg shadow-2xl aspect-video object-contain bg-black" />
                            ) : (
                                <video 
                                    ref={videoPreviewRef}
                                    controls={!isProcessing}
                                    muted
                                    className="w-full max-w-4xl rounded-lg shadow-2xl aspect-video object-contain bg-black"
                                    src={videoSrc ?? undefined}
                                />
                            )}
                             {!isProcessing && (
                                <p className="mt-4 text-slate-400">Your selected video is ready. Use the controls on the left to start extracting frames.</p>
                             )}
                        </div>
                    )}
                </main>
            </div>
        );
    };
    
    return (
        <>
            {!currentVideo ? renderInitialView() : renderProcessingView()}
            {configuringVideo && <SegmentSelectorModal item={configuringVideo} onClose={() => setConfiguringVideo(null)} onSave={handleSaveConfiguration} />}
            {previewingImage && <ImagePreviewModal image={previewingImage} onClose={() => setPreviewingImage(null)} isEnhanced={'url' in previewingImage} />}
            {croppingFrame && <CropImageModal frame={croppingFrame} onSave={handleSaveCrop} onClose={() => setCroppingFrame(null)} />}
        </>
    );
};

export default App;
