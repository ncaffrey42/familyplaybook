import React, { useCallback, useRef, useState, useEffect } from 'react';
import imageCompression from 'browser-image-compression';
import { Camera, Loader2, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';

/**
 * AvatarUpload
 *
 * Focused, opinionated avatar picker. Click the avatar (or the Change
 * button) to choose a file. Uploads to the `avatars` bucket at
 * `avatars/{userId}/{timestamp}.jpg`, writes the public URL into the
 * user's profile (and auth metadata), then deletes the previous file.
 *
 * Best-practice notes baked in:
 *   • Image MIME only (rejects SVG — XSS risk via embedded scripts)
 *   • 5 MB hard cap before compression
 *   • Compressed to ~512px square JPEG (~200 KB target)
 *   • Cache-bust via timestamped filename, not a query string
 *   • Old file cleaned up after successful new upload
 *   • Object URL preview revoked to avoid memory leaks
 *   • Optimistic UI; rolls back to last good state on failure
 *   • No double-uploads (button disabled while busy)
 *   • Storage quota intentionally NOT decremented — avatars are
 *     operationally negligible and shouldn't eat into guide-media quota.
 */

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const BUCKET = 'avatars';

const COMPRESS_OPTIONS = {
  maxSizeMB: 0.25,
  maxWidthOrHeight: 512,
  useWebWorker: true,
  fileType: 'image/jpeg',
};

const isImageMime = (type) =>
  typeof type === 'string' &&
  type.startsWith('image/') &&
  // SVG can carry executable script; reject defensively.
  type !== 'image/svg+xml';

// Extract the storage path of a previously-uploaded avatar so we can delete
// it on replace. Returns null if the URL doesn't look like one of ours.
const pathFromPublicUrl = (publicUrl, userId) => {
  if (!publicUrl || !userId) return null;
  // Supabase public URL format: .../storage/v1/object/public/avatars/<userId>/<file>
  const marker = `/object/public/${BUCKET}/${userId}/`;
  const idx = publicUrl.indexOf(marker);
  if (idx === -1) return null;
  return `${userId}/${publicUrl.slice(idx + marker.length)}`;
};

const AvatarUpload = ({ avatarUrl, fullName, onChange }) => {
  const { user, refreshProfile } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);

  // Clean up any blob: URLs we created.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const displayUrl = previewUrl || avatarUrl || undefined;
  const initial =
    (fullName?.trim()?.[0] || user?.email?.[0] || '?').toUpperCase();

  const persist = useCallback(
    async (nextUrl) => {
      // Note: the profiles table doesn't have an `updated_at` column; if
      // one is added later it's safe to include here.
      const updates = { id: user.id, avatar_url: nextUrl };
      const { error: profileError } = await supabase
        .from('profiles')
        .upsert(updates);
      if (profileError) throw profileError;

      // Keep auth metadata in sync — used by share screens and OAuth flows.
      await supabase.auth.updateUser({ data: { avatar_url: nextUrl } });
      await refreshProfile();
    },
    [user, refreshProfile]
  );

  const handleFile = useCallback(
    async (file) => {
      if (!user) {
        toast({ title: 'Not signed in', variant: 'destructive' });
        return;
      }
      if (!isImageMime(file.type)) {
        toast({
          title: 'Unsupported file type',
          description: 'Choose a JPG, PNG, WEBP, or HEIC image.',
          variant: 'destructive',
        });
        return;
      }
      if (file.size > MAX_BYTES) {
        toast({
          title: 'Image too large',
          description: 'Please choose an image under 5 MB.',
          variant: 'destructive',
        });
        return;
      }

      // Show an immediate preview using a local blob URL.
      const objectUrl = URL.createObjectURL(file);
      setPreviewUrl(objectUrl);
      setBusy(true);

      const previousUrl = avatarUrl;
      const previousPath = pathFromPublicUrl(previousUrl, user.id);

      try {
        const compressed = await imageCompression(file, COMPRESS_OPTIONS);
        const filename = `${Date.now()}.jpg`;
        const path = `${user.id}/${filename}`;

        const { error: uploadError } = await supabase.storage
          .from(BUCKET)
          .upload(path, compressed, {
            contentType: 'image/jpeg',
            cacheControl: '3600',
            upsert: false,
          });
        if (uploadError) throw uploadError;

        const {
          data: { publicUrl },
        } = supabase.storage.from(BUCKET).getPublicUrl(path);

        await persist(publicUrl);
        onChange?.(publicUrl);

        // Best-effort cleanup of the previous file. Don't block on errors.
        if (previousPath && previousPath !== path) {
          supabase.storage.from(BUCKET).remove([previousPath]).catch(() => {});
        }

        toast({ title: 'Avatar updated', variant: 'success' });
      } catch (err) {
        // Roll back UI to whatever was saved on the server.
        setPreviewUrl(null);
        toast({
          title: 'Upload failed',
          description: err?.message || 'Please try again.',
          variant: 'destructive',
        });
      } finally {
        setBusy(false);
        // Free the blob URL now that the real (or rolled-back) URL is in state.
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        setPreviewUrl((current) => (current === objectUrl ? null : current));
      }
    },
    [user, avatarUrl, persist, onChange, toast]
  );

  const onFileInputChange = (e) => {
    const file = e.target.files?.[0];
    // Reset the input so picking the same file again re-fires onChange.
    e.target.value = '';
    if (file) handleFile(file);
  };

  const openPicker = () => {
    if (!busy) fileInputRef.current?.click();
  };

  const handleRemove = async () => {
    if (!user || busy || !avatarUrl) return;
    setBusy(true);
    const path = pathFromPublicUrl(avatarUrl, user.id);
    try {
      await persist(null);
      onChange?.(null);
      if (path) {
        supabase.storage.from(BUCKET).remove([path]).catch(() => {});
      }
      toast({ title: 'Avatar removed' });
    } catch (err) {
      toast({
        title: 'Could not remove avatar',
        description: err?.message,
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic"
        className="sr-only"
        onChange={onFileInputChange}
      />

      <button
        type="button"
        onClick={openPicker}
        disabled={busy}
        className="relative group rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        aria-label="Change avatar"
      >
        <Avatar className="h-24 w-24 border-2 border-border">
          <AvatarImage src={displayUrl} alt="" />
          <AvatarFallback className="text-2xl">{initial}</AvatarFallback>
        </Avatar>
        <span
          className={`absolute inset-0 rounded-full flex items-center justify-center bg-black/45 text-white transition-opacity ${
            busy ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100'
          }`}
        >
          {busy ? <Loader2 className="h-6 w-6 animate-spin" /> : <Camera className="h-6 w-6" />}
        </span>
      </button>

      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={openPicker}
          disabled={busy}
        >
          <Camera className="w-4 h-4 mr-2" />
          {avatarUrl ? 'Change' : 'Upload'}
        </Button>
        {avatarUrl && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleRemove}
            disabled={busy}
            className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
            aria-label="Remove avatar"
            title="Remove avatar"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        )}
      </div>
      <span className="text-xs text-muted-foreground">JPG, PNG, WEBP up to 5 MB</span>
    </div>
  );
};

export default AvatarUpload;
