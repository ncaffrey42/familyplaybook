import React, { useState, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import imageCompression from 'browser-image-compression';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { Upload, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { entitlementService } from '@/lib/EntitlementService';
import { UsageTrackingService } from '@/lib/UsageTrackingService';

const ImageUpload = ({ currentImage, onImageUpload, setIsUploading: setParentIsUploading, storagePath, placeholder }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [imageUrl, setImageUrl] = useState(currentImage);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  useEffect(() => {
    setImageUrl(currentImage);
  }, [currentImage]);

  const onDrop = useCallback(async (acceptedFiles) => {
    const file = acceptedFiles[0];
    if (!file) return;

    if (!user) {
      toast({ title: "Authentication Error", description: "You must be logged in to upload images.", variant: "destructive" });
      return;
    }

    // Entitlement Check
    try {
      const entitlement = await entitlementService.canPerform(user.id, 'FILE_UPLOAD', { file_size_bytes: file.size });
      if (!entitlement.allowed) {
        toast({ 
          title: "Storage Limit Reached", 
          description: entitlement.reason_code || "Insufficient storage space.", 
          variant: "destructive" 
        });
        return;
      }
    } catch (e) {
      console.error(e);
      return;
    }

    setIsUploading(true);
    if (setParentIsUploading) setParentIsUploading(true);
    setUploadProgress(0);

    const options = { maxSizeMB: 1, maxWidthOrHeight: 1920, useWebWorker: true, fileType: 'image/jpeg', onProgress: (p) => setUploadProgress(p) };

    try {
      const compressedFile = await imageCompression(file, options);
      const fileName = `${user.id}-${Date.now()}.jpg`;
      const filePath = storagePath ? `${storagePath}/${fileName}` : fileName;

      const { error: uploadError } = await supabase.storage.from('images').upload(filePath, compressedFile, { contentType: 'image/jpeg' });
      if (uploadError) throw uploadError;

      // Usage Update
      UsageTrackingService.updateUsageMetric(user.id, 'storage_bytes', compressedFile.size).catch(console.error);

      const { data: { publicUrl } } = supabase.storage.from('images').getPublicUrl(filePath);
      
      setImageUrl(publicUrl);
      if (onImageUpload) onImageUpload(publicUrl);

      toast({ title: "✅ Upload Successful!", description: "Image optimized and saved." });

    } catch (error) {
      console.error('Upload error:', error);
      toast({ title: "Upload Failed", description: error.message, variant: "destructive" });
    } finally {
      setIsUploading(false);
      if (setParentIsUploading) setParentIsUploading(false);
      setUploadProgress(0);
    }
  }, [user, onImageUpload, toast, storagePath, setParentIsUploading]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/jpeg': [], 'image/png': [], 'image/heic': [], 'image/webp': [] },
    multiple: false,
    disabled: isUploading,
  });

  const handleRemoveImage = (e) => {
    e.stopPropagation();
    setImageUrl(null);
    if (onImageUpload) onImageUpload(null);
  };

  if (imageUrl) {
    return (
      <div className="relative w-full h-40 rounded-2xl bg-white dark:bg-gray-800 shadow-card overflow-hidden group">
        <img src={imageUrl} alt="Uploaded preview" className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
          <Button variant="destructive" size="icon" onClick={handleRemoveImage} className="rounded-full"><X size={20} /></Button>
        </div>
      </div>
    );
  }

  if (isUploading) {
    return (
      <div className="w-full h-40 rounded-2xl bg-gray-200 dark:bg-gray-800 flex flex-col items-center justify-center text-center p-4">
        <Loader2 className="h-10 w-10 text-[#5CA9E9] animate-spin mb-4" />
        <p className="font-semibold text-gray-700 dark:text-gray-300">Processing...</p>
      </div>
    );
  }

  return (
    <div {...getRootProps()}>
      <input {...getInputProps()} />
      {placeholder || (
        <div className={`w-full h-40 rounded-2xl flex flex-col items-center justify-center text-center p-4 cursor-pointer transition-colors ${isDragActive ? 'bg-blue-100 border-[#5CA9E9]' : 'bg-gray-200 border-gray-400'} border-2 border-dashed hover:border-[#5CA9E9]`}>
          <Upload size={40} className="text-gray-500 mb-2" />
          <p className="font-semibold text-gray-600 dark:text-gray-400">{isDragActive ? 'Drop it here!' : 'Upload an Image'}</p>
        </div>
      )}
    </div>
  );
};

export default ImageUpload;