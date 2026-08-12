import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { logError } from '@/lib/errorLogger';
import ImageUpload from '@/components/ImageUpload';

/**
 * Properties — the Host shell's landing tab (docs/platform/PROPERTIES.md §1).
 *
 * A property is a row plus a convention: one bundle per property, on the
 * existing content engine (properties.bundle_id NOT NULL UNIQUE → packs).
 * Creating a property therefore inserts the bundle FIRST and then the
 * property row pointing at it; if the property insert fails, the freshly
 * created bundle is deleted (best-effort) so no orphan playbook appears in
 * the Guides tab.
 *
 * No flag checks in here — the HostShell layout route guards this screen
 * (HOST_SHELL.md §3), same as every other host tab.
 */

const SectionLabel = ({ children }) => (
  <div className="text-[10.5px] font-bold uppercase tracking-[0.13em] text-apricot mb-3">
    {children}
  </div>
);

/** Photo thumbnail, or the apricot-halo placeholder when there is none. */
const PropertyThumb = ({ photoUrl, name }) =>
  photoUrl ? (
    <img
      src={photoUrl}
      alt={name}
      className="w-[52px] h-[52px] rounded-xl object-cover flex-shrink-0"
    />
  ) : (
    <span className="w-[52px] h-[52px] rounded-xl bg-halo-apricot flex items-center justify-center flex-shrink-0">
      <span className="w-4 h-4 rounded-full bg-apricot" />
    </span>
  );

const PhotoDropZone = (
  <div className="w-full h-32 rounded-2xl border-2 border-dashed border-checkbox-ring bg-cream flex flex-col items-center justify-center text-center p-3 cursor-pointer transition-colors hover:border-hover-border">
    <span className="w-9 h-9 rounded-full bg-halo-apricot flex items-center justify-center mb-1.5">
      <span className="w-3 h-3 rounded-full bg-apricot" />
    </span>
    <span className="text-[13px] font-bold text-body-copy">Add a photo</span>
    <span className="text-[12px] text-muted-copy">Optional</span>
  </div>
);

const HostProperties = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);

  // "Add a property" inline form
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [photoUrl, setPhotoUrl] = useState(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id) return;
    // packs(name, pack_guides(guide_id)) — same embedded pattern DataContext
    // uses for bundle guide counts; cheap enough for a per-owner list.
    const { data, error } = await supabase
      .from('properties')
      .select('id, name, address, photo_url, bundle_id, created_at, packs(name, pack_guides(guide_id))')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });
    if (error) {
      logError(error, { context: 'HostProperties.load' });
    } else {
      setProperties(data || []);
    }
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const resetForm = () => {
    setAdding(false);
    setName('');
    setAddress('');
    setPhotoUrl(null);
  };

  const handleCreate = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast({ title: 'Give the place a name', variant: 'destructive' });
      return;
    }
    if (!user?.id || saving) return;
    setSaving(true);
    try {
      // Bundle FIRST: properties.bundle_id is NOT NULL, so the playbook has
      // to exist before the property row can point at it. .select() after
      // insert so an RLS refusal surfaces as an error, not a silent no-op.
      const { data: bundle, error: bundleError } = await supabase
        .from('packs')
        .insert({ user_id: user.id, name: trimmedName })
        .select('id')
        .single();
      if (bundleError) throw bundleError;

      const { data: property, error: propertyError } = await supabase
        .from('properties')
        .insert({
          user_id: user.id,
          bundle_id: bundle.id,
          name: trimmedName,
          address: address.trim() || null,
          photo_url: photoUrl || null,
        })
        .select('id')
        .single();
      if (propertyError) {
        // Best-effort rollback: don't leave an orphan bundle behind the
        // failed property. If this delete fails too, the bundle is at least
        // a normal, user-deletable pack.
        await supabase.from('packs').delete().eq('id', bundle.id);
        throw propertyError;
      }

      toast({ title: 'Property added', description: `“${trimmedName}” has its own playbook now.` });
      resetForm();
      navigate(`/host/property/${property.id}`);
    } catch (error) {
      logError(error, { context: 'HostProperties.create' });
      toast({ title: "Couldn't add the property", description: 'Please try again.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const addForm = (
    <section className="mt-5 bg-card rounded-lg border border-card-border shadow-card p-5">
      <h2 className="font-display font-semibold text-[19px] text-mulberry dark:text-foreground">
        New property
      </h2>
      <p className="mt-0.5 text-[13px] text-muted-copy">Its guest playbook is created with it.</p>
      <div className="mt-4 space-y-4">
        <div>
          <label
            htmlFor="property-name"
            className="block text-[10.5px] font-bold uppercase tracking-[0.13em] text-apricot mb-1.5"
          >
            Name
          </label>
          <input
            id="property-name"
            type="text"
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ivy Cottage"
            className="w-full h-11 px-3 rounded-lg border border-card-border bg-card text-[14.5px] text-mulberry dark:text-foreground"
          />
        </div>
        <div>
          <label
            htmlFor="property-address"
            className="block text-[10.5px] font-bold uppercase tracking-[0.13em] text-apricot mb-1.5"
          >
            Address <span className="normal-case tracking-normal font-semibold text-muted-copy">(optional)</span>
          </label>
          <input
            id="property-address"
            type="text"
            maxLength={160}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="12 Vine Lane, Halfway House"
            className="w-full h-11 px-3 rounded-lg border border-card-border bg-card text-[14.5px] text-mulberry dark:text-foreground"
          />
        </div>
        <div>
          <div className="text-[10.5px] font-bold uppercase tracking-[0.13em] text-apricot mb-1.5">
            Photo
          </div>
          <ImageUpload
            currentImage={photoUrl}
            onImageUpload={setPhotoUrl}
            setIsUploading={setUploadingPhoto}
            storagePath="properties"
            placeholder={PhotoDropZone}
          />
        </div>
        <div className="flex gap-2.5">
          <button
            onClick={handleCreate}
            disabled={saving || uploadingPhoto}
            className="flex-1 h-12 rounded-full bg-apricot text-mulberry font-bold text-[15px] transition-opacity disabled:opacity-60"
          >
            {saving ? 'Creating…' : 'Create property'}
          </button>
          <button
            onClick={resetForm}
            disabled={saving}
            className="h-12 px-5 rounded-full bg-blush text-blush-copy font-bold text-[15px]"
          >
            Cancel
          </button>
        </div>
      </div>
    </section>
  );

  return (
    <div>
      <SectionLabel>Properties</SectionLabel>

      {loading ? (
        <div className="space-y-2.5">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="h-[76px] rounded-lg bg-blush/60 animate-pulse" />
          ))}
        </div>
      ) : properties.length === 0 && !adding ? (
        <div className="bg-card rounded-lg border border-card-border shadow-card p-6 text-center">
          <span className="mx-auto w-[52px] h-[52px] rounded-full bg-halo-apricot flex items-center justify-center mb-3">
            <span className="w-4 h-4 rounded-full bg-apricot" />
          </span>
          <p className="font-display font-semibold text-[19px] text-mulberry dark:text-foreground">
            Set up your first place
          </p>
          <p className="mt-1 text-[13.5px] leading-[1.5] text-muted-copy">
            Each property gets its own guest playbook, dated links for every stay, and a printable QR
            sheet for the hallway.
          </p>
          <button
            onClick={() => setAdding(true)}
            className="mt-4 h-11 px-6 rounded-full bg-apricot text-mulberry font-bold text-[14.5px]"
          >
            Add a property
          </button>
        </div>
      ) : (
        <div className="space-y-2.5">
          {properties.map((p) => {
            const guideCount = p.packs?.pack_guides?.length ?? 0;
            return (
              <button
                key={p.id}
                onClick={() => navigate(`/host/property/${p.id}`)}
                className="w-full bg-card rounded-lg border border-card-border shadow-card px-4 py-3 flex items-center gap-3.5 text-left transition-all hover:border-hover-border"
              >
                <PropertyThumb photoUrl={p.photo_url} name={p.name} />
                <span className="flex-1 min-w-0">
                  <span className="block font-bold text-[15.5px] text-mulberry dark:text-foreground truncate">
                    {p.name}
                  </span>
                  <span className="block text-[12.5px] text-muted-copy truncate">
                    {p.address || 'No address yet'}
                    {' · '}
                    {guideCount === 1 ? '1 guide' : `${guideCount} guides`}
                  </span>
                </span>
                <span className="text-chevron">›</span>
              </button>
            );
          })}
        </div>
      )}

      {adding && addForm}

      {!adding && !loading && properties.length > 0 && (
        <button
          onClick={() => setAdding(true)}
          className="mt-5 w-full h-12 rounded-full bg-apricot text-mulberry font-bold text-[15.5px]"
        >
          Add a property
        </button>
      )}
    </div>
  );
};

export default HostProperties;
