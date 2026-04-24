import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import imageCompression from 'browser-image-compression';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { Film, Image as ImageIcon, Loader2, X, UploadCloud, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { v4 as uuidv4 } from 'uuid';
import { compressVideo } from '@/lib/videoCompression';
import { isVideoUrl } from '@/lib/utils';
import { entitlementService } from '@/services/EntitlementService';
import { UsageTrackingService } from '@/services/UsageTrackingService';

const MAX_VIDEO_SIZE_MB = 150;
const MAX_IMAGE_SIZE_MB = 20;

const MediaUpload = ({ guideId, currentMedia, onUpload }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [mediaUrl, setMediaUrl] = useState(currentMedia);
  const [mediaType, setMediaType] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentFileDetails, setCurrentFileDetails] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    setMediaUrl(currentMedia);
    if (currentMedia) {
        const isVideo = isVideoUrl(currentMedia);
        setMediaType(isVideo ? 'video' : 'image');
    } else {
        setMediaType(null);
    }
  }, [currentMedia]);

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const onDrop = useCallback(async (acceptedFiles) => {
    const file = acceptedFiles[0];
    if (!file) return;

    if (!user) {
      toast({ title: "Authentication Error", description: "You must be logged in to upload files.", variant: "destructive" });
      return;
    }

    const isImage = file.type.startsWith('image/');
    const originalSizeMB = file.size / (1024 * 1024);
    
    // Size check
    if (isImage && originalSizeMB > MAX_IMAGE_SIZE_MB) {
      toast({ title: "Image too large", description: `Please choose an image under ${MAX_IMAGE_SIZE_MB}MB.`, variant: "destructive" });
      return;
    }
    if (!isImage && originalSizeMB > MAX_VIDEO_SIZE_MB) {
       toast({ title: "Video too large", description: `Your video is ${formatFileSize(file.size)}. Please clip it to under ${MAX_VIDEO_SIZE_MB}MB.`, variant: "destructive" });
       return;
    }

    // Entitlement Check for Storage
    try {
      const entitlement = await entitlementService.canPerform(user.id, 'FILE_UPLOAD', { file_size_bytes: file.size });
      if (!entitlement.allowed) {
        toast({ 
          title: "Storage Limit Reached", 
          description: entitlement.reason_code || "You don't have enough storage space.", 
          variant: "destructive" 
        });
        return;
      }
    } catch (e) {
      console.error("Entitlement check error", e);
      toast({ title: "Error", description: "Could not verify storage limits.", variant: "destructive" });
      return;
    }

    setIsUploading(true);
    setProgress(0);
    setMediaType(isImage ? 'image' : 'video');
    setCurrentFileDetails({ name: file.name, size: formatFileSize(file.size) });
    
    let fileToUpload = file;
    let progressInterval;

    try {
      if (isImage) {
        toast({ title: "Optimizing Image...", description: "Compressing..." });
        const options = { maxSizeMB: 1, maxWidthOrHeight: 1920, useWebWorker: true, fileType: 'image/jpeg' };
        fileToUpload = await imageCompression(file, options);
      } 
      else {
        setIsCompressing(true);
        toast({ title: "Optimizing Video", description: "Compressing video..." });
        try {
          fileToUpload = await compressVideo(file, (pct) => setProgress(pct));
        } catch (err) {
          console.warn("Video compression failed, falling back.", err);
          fileToUpload = file;
        } finally {
          setIsCompressing(false);
          setProgress(0);
        }
      }

      progressInterval = setInterval(() => {
        setProgress((prev) => (prev >= 95 ? prev : prev + (Math.random() * 15)));
      }, 400);

      const fileExt = isImage ? 'jpg' : (fileToUpload.name.split('.').pop() || 'mp4');
      const storageId = guideId || `temp-${uuidv4()}`;
      const timestamp = Date.now();
      const safeName = fileToUpload.name.replace(/[^a-zA-Z0-9]/g, '-');
      const filePath = `guide-media/${storageId}/${user.id}-${timestamp}-${safeName}.${fileExt}`;
      const bucketName = isImage ? 'images' : 'guide-videos';
      
      const { error: uploadError } = await supabase.storage.from(bucketName).upload(filePath, fileToUpload, {
        cacheControl: '3600',
        upsert: false,
        contentType: isImage ? 'image/jpeg' : fileToUpload.type
      });

      if (uploadError) throw uploadError;

      // Usage Update
      UsageTrackingService.updateUsageMetric(user.id, 'storage_bytes', fileToUpload.size).catch(console.error);

      setProgress(100);
      if (progressInterval) clearInterval(progressInterval);

      const { data: { publicUrl } } = supabase.storage.from(bucketName).getPublicUrl(filePath);
      
      setMediaUrl(publicUrl);
      if (onUpload) {
        onUpload(publicUrl, isImage ? 'image' : 'video');
      }

      toast({ title: "✅ Success!", description: "File uploaded successfully.", variant: "success" });

    } catch (error) {
      console.error('Upload error:', error);
      toast({ title: "Upload Failed", description: error.message || "Network error.", variant: "destructive" });
      setMediaType(null);
      setMediaUrl(null);
    } finally {
      if (progressInterval) clearInterval(progressInterval);
      setIsUploading(false);
      setIsCompressing(false);
      setCurrentFileDetails(null);
      setProgress(0);
    }
  }, [user, onUpload, toast, guideId]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 
      'image/jpeg': [], 'image/png': [], 'image/webp': [],
      'video/mp4': [], 'video/quicktime': [], 'video/webm': [], 'video/x-m4v': []
    },
    multiple: false,
    disabled: isUploading,
    noClick: true,
    noKeyboard: true
  });

  const handleRemoveMedia = (e) => {
    e.stopPropagation();
    // Note: We don't verify delete here because we don't have file size/path to decrement usage reliably
    // without fetching metadata. For now, we only track positive usage.
    setMediaUrl(null);
    setMediaType(null);
    if (onUpload) {
      onUpload(null, null);
    }
  };

  const handleContainerClick = () => {
    if (!isUploading && fileInputRef.current) {
        fileInputRef.current.click();
    }
  };

  if (mediaUrl) {
    return (
      <div className="relative w-full h-48 rounded-2xl bg-white dark:bg-gray-800 shadow-card overflow-hidden group border border-gray-100 dark:border-gray-700">
        {mediaType === 'video' ? (
            <video src={mediaUrl} controls className="w-full h-full object-cover bg-black" />
        ) : (
            <img src={mediaUrl} alt="Uploaded preview" className="w-full h-full object-cover" />
        )}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
          <Button variant="destructive" size="icon" onClick={handleRemoveMedia} className="rounded-full hover:scale-110 transition-transform">
            <X size={20} />
          </Button>
        </div>
      </div>
    );
  }

  if (isUploading) {
    return (
      <div className="w-full h-48 rounded-2xl bg-gray-50 dark:bg-gray-800/50 border-2 border-dashed border-purple-200 dark:border-purple-900 flex flex-col items-center justify-center text-center p-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-white/50 dark:bg-black/20 backdrop-blur-[1px] z-0" />
        <div className="z-10 flex flex-col items-center w-full max-w-[80%]">
            <div className="relative mb-3">
               {isCompressing ? <Zap className="h-8 w-8 text-yellow-500 animate-pulse" /> : <Loader2 className="h-8 w-8 text-purple-600 animate-spin" />}
            </div>
            <p className="font-semibold text-gray-800 dark:text-gray-200 text-sm mb-1">
              {isCompressing ? 'Compressing Video...' : `Uploading ${mediaType === 'video' ? 'Video' : 'Image'}...`}
            </p>
            {currentFileDetails && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">{currentFileDetails.name} ({currentFileDetails.size})</p>
            )}
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div 
                    className={`h-2 rounded-full transition-all duration-300 ease-out ${isCompressing ? 'bg-yellow-500' : 'bg-gradient-to-r from-purple-500 to-blue-500'}`}
                    style={{ width: `${progress}%` }}
                ></div>
            </div>
        </div>
      </div>
    );
  }

  return (
    <div {...getRootProps({ onClick: (e) => e.preventDefault() })} onClick={handleContainerClick} className="group">
      <input {...getInputProps({ ref: fileInputRef })} />
      <div className={`w-full h-48 rounded-2xl flex flex-col items-center justify-center text-center p-6 cursor-pointer transition-all duration-200 ${isDragActive ? 'bg-purple-50 border-purple-500' : 'bg-gray-50 border-gray-300 hover:bg-white'} border-2 border-dashed`}>
        <div className="p-3 rounded-full mb-3 bg-gray-100 text-gray-500 group-hover:bg-purple-50 group-hover:text-purple-600">
            <UploadCloud size={28} />
        </div>
        <h3 className="font-semibold text-gray-700 dark:text-gray-200">
          {isDragActive ? 'Drop it here!' : 'Upload Media'}
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 px-4">Drag & drop or click to browse</p>
        <div className="flex items-center gap-4 mt-4 text-xs text-gray-400">
            <span className="flex items-center gap-1"><ImageIcon size={12}/> Images &lt;{MAX_IMAGE_SIZE_MB}MB</span>
            <span className="flex items-center gap-1"><Film size={12}/> Video &lt;{MAX_VIDEO_SIZE_MB}MB</span>
        </div>
      </div>
    </div>
  );
};

export default MediaUpload;