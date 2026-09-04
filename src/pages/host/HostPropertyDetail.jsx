import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useData } from '@/contexts/DataContext';
import { useToast } from '@/components/ui/use-toast';
import { logError } from '@/lib/errorLogger';
import { humanizeExpiry, isExpired, expiryFromDateInput } from '@/lib/shareExpiry';
import GuideIcon from '@/components/GuideIcon';
import ImageUpload from '@/components/ImageUpload';

/**
 * One property: its playbook (the property's one bundle), the dated guest
 * links issued against that bundle, and the door to the printable QR sheet.
 * See docs/platform/PROPERTIES.md §3 — everything here is reuse: the guide
 * editor, ShareScreen for QR + copy, and SHARING.md §3's arbitrary-expiry
 * date math relabelled as check-in / check-out.
 *
 * No flag checks in here — the HostShell layout route guards this screen.
 */

/**
 * GuideIcon's halo colours key off the family taxonomy. Rather than teach it
 * a second one, map each host category to the family category whose
 * colour matches its seeded color_token (migration 20240130):
 * Arrival→raspberry, House→apricot, Local→mulberry, Departure→coral.
 */
const HOST_ICON_CATEGORY = {
  Arrival: 'How To',
  House: 'Find It',
  Local: 'Reference',
  Departure: 'Emergency',
};

const SectionLabel = ({ children }) => (
  <div className="text-[10.5px] font-bold uppercase tracking-[0.13em] text-apricot mb-3">
    {children}
  </div>
);

const FieldLabel = ({ htmlFor, children }) => (
  <label
    htmlFor={htmlFor}
    className="block text-[10.5px] font-bold uppercase tracking-[0.13em] text-apricot mb-1.5"
  >
    {children}
  </label>
);

/** "2026-08-14" → "Aug 14" (local), for link labels. */
const fmtDay = (value) => {
  const [y, m, d] = String(value).split('-').map(Number);
  if (!y || !m || !d) return value;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

const HostPropertyDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const { bundleLibrary, handleAddBundleFromLibrary } = useData();

  const [property, setProperty] = useState(null);
  const [guides, setGuides] = useState([]);
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Header editing
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editPhoto, setEditPhoto] = useState(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);

  // Delete (two-step inline confirm)
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // New dated link mini-form
  const [checkin, setCheckin] = useState('');
  const [checkout, setCheckout] = useState('');
  const [creatingLink, setCreatingLink] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id || !id) return;
    try {
      const { data: prop, error: propError } = await supabase
        .from('properties')
        .select('id, bundle_id, name, address, photo_url')
        .eq('id', id)
        .single();
      if (propError || !prop) {
        setNotFound(true);
        return;
      }
      setProperty(prop);

      const [guidesRes, linksRes] = await Promise.all([
        supabase
          .from('pack_guides')
          .select('guide_id, guides(id, name, category, icon)')
          .eq('pack_id', prop.bundle_id),
        // recipient_label only exists after migration 20240128. Host screens
        // are post-migration surfaces — the whole host flag requires
        // migrations 20240128–20240131 applied — so it is selected (and
        // written, below) unconditionally, and rendering degrades gracefully
        // if it ever comes back undefined.
        supabase
          .from('shared_links')
          .select('id, created_at, expires_at, recipient_label')
          .eq('user_id', user.id)
          .eq('bundle_id', prop.bundle_id)
          .order('created_at', { ascending: false }),
      ]);
      setGuides((guidesRes.data || []).map((r) => r.guides).filter(Boolean));
      setLinks(linksRes.data || []);
    } catch (error) {
      logError(error, { context: 'HostPropertyDetail.load' });
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [user?.id, id]);

  useEffect(() => {
    load();
  }, [load]);

  // The Host Starter Kit lives in the SAME library tables and copy-to-mine
  // flow families use (PROPERTIES.md §4). Hidden when the seed migration
  // (20240131) hasn't been applied, i.e. the pack isn't in the library.
  const starterKit = useMemo(
    () => (bundleLibrary || []).find((b) => b.id === 'pack_host_starter'),
    [bundleLibrary]
  );

  const startEdit = () => {
    setEditName(property.name);
    setEditAddress(property.address || '');
    setEditPhoto(property.photo_url || null);
    setEditing(true);
  };

  const handleSaveEdit = async () => {
    const trimmedName = editName.trim();
    if (!trimmedName) {
      toast({ title: 'The property needs a name', variant: 'destructive' });
      return;
    }
    setSavingEdit(true);
    const { data, error } = await supabase
      .from('properties')
      .update({
        name: trimmedName,
        address: editAddress.trim() || null,
        photo_url: editPhoto || null,
      })
      .eq('id', property.id)
      .select('id, name, address, photo_url')
      .single();
    setSavingEdit(false);
    if (error || !data) {
      logError(error, { context: 'HostPropertyDetail.saveEdit' });
      toast({ title: "Couldn't save the changes", variant: 'destructive' });
      return;
    }
    setProperty((prev) => ({ ...prev, ...data }));
    setEditing(false);
    toast({ title: 'Property updated' });
  };

  // Delete the property row ONLY. The bundle is deliberately kept — content
  // outlives the veneer (PROPERTIES.md §1); the playbook and its guides stay
  // in the owner's library. The schema's ON DELETE RESTRICT would refuse the
  // other order anyway. Deleting the bundle is NOT part of v1.
  const handleDelete = async () => {
    const { data, error } = await supabase
      .from('properties')
      .delete()
      .eq('id', property.id)
      .select('id');
    if (error || !data?.length) {
      logError(error, { context: 'HostPropertyDetail.delete' });
      toast({ title: "Couldn't remove the property", variant: 'destructive' });
      return;
    }
    toast({
      title: 'Property removed',
      description: 'Its playbook and guides are still in your library.',
    });
    navigate('/host/properties', { replace: true });
  };

  const revokeLink = async (linkId) => {
    const prev = links;
    setLinks(links.filter((l) => l.id !== linkId)); // optimistic
    const { error } = await supabase.from('shared_links').delete().eq('id', linkId);
    if (error) {
      setLinks(prev);
      toast({ title: 'Could not turn the link off', description: 'Please try again.', variant: 'destructive' });
    } else {
      toast({ title: 'Link turned off', description: 'That link no longer works for anyone.' });
    }
  };

  const handleCreateLink = async () => {
    if (!property || !checkout || creatingLink) return;
    // The LINK's life is governed by the end of the check-out day; the
    // check-in date is informational only — it just makes the label.
    const expiresAt = expiryFromDateInput(checkout);
    if (!expiresAt) return;
    setCreatingLink(true);
    try {
      const label = checkin
        ? `Stay ${fmtDay(checkin)} – ${fmtDay(checkout)}`
        : `Stay to ${fmtDay(checkout)}`;
      const { data, error } = await supabase
        .from('shared_links')
        .insert({
          user_id: user.id,
          bundle_id: property.bundle_id,
          guide_id: null,
          expires_at: expiresAt,
          // Post-migration column, written unconditionally — see the comment
          // on the select in load().
          recipient_label: label,
        })
        .select('id')
        .single();
      if (error) throw error;
      setCheckin('');
      setCheckout('');
      // Hand off to the existing link-ready screen for QR + copy.
      navigate(`/share-manage/${data.id}`);
    } catch (error) {
      logError(error, { context: 'HostPropertyDetail.createLink' });
      toast({ title: "Couldn't create the link", description: 'Please try again.', variant: 'destructive' });
    } finally {
      setCreatingLink(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-2.5">
        <div className="h-[120px] rounded-lg bg-blush/60 animate-pulse" />
        <div className="h-[64px] rounded-lg bg-blush/60 animate-pulse" />
        <div className="h-[64px] rounded-lg bg-blush/60 animate-pulse" />
      </div>
    );
  }

  if (notFound || !property) {
    return (
      <div className="bg-card rounded-lg border border-card-border shadow-card p-6 text-center">
        <p className="font-display font-semibold text-[19px] text-mulberry dark:text-foreground">
          Can't find that property
        </p>
        <p className="mt-1 text-[13.5px] text-muted-copy">It may have been removed.</p>
        <button
          onClick={() => navigate('/host/properties')}
          className="mt-4 h-11 px-6 rounded-full bg-apricot text-mulberry font-bold text-[14.5px]"
        >
          Back to properties
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate('/host/properties')}
          className="text-[13.5px] font-bold text-muted-copy"
        >
          ‹ Properties
        </button>
        {!editing && (
          <button onClick={startEdit} className="text-[13.5px] font-bold text-apricot">
            Edit
          </button>
        )}
      </div>

      {/* Header: photo, name, address — or the edit form */}
      <div className="mt-4 bg-card rounded-lg border border-card-border shadow-card overflow-hidden">
        {!editing && property.photo_url && (
          <img src={property.photo_url} alt={property.name} className="w-full h-40 object-cover" />
        )}
        <div className="p-5">
          {editing ? (
            <div className="space-y-4">
              <div>
                <FieldLabel htmlFor="edit-property-name">Name</FieldLabel>
                <input
                  id="edit-property-name"
                  type="text"
                  maxLength={80}
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full h-11 px-3 rounded-lg border border-card-border bg-card text-[14.5px] text-mulberry dark:text-foreground"
                />
              </div>
              <div>
                <FieldLabel htmlFor="edit-property-address">Address</FieldLabel>
                <input
                  id="edit-property-address"
                  type="text"
                  maxLength={160}
                  value={editAddress}
                  onChange={(e) => setEditAddress(e.target.value)}
                  placeholder="12 Vine Lane, Halfway House"
                  className="w-full h-11 px-3 rounded-lg border border-card-border bg-card text-[14.5px] text-mulberry dark:text-foreground"
                />
              </div>
              <div>
                <div className="text-[10.5px] font-bold uppercase tracking-[0.13em] text-apricot mb-1.5">
                  Photo
                </div>
                <ImageUpload
                  currentImage={editPhoto}
                  onImageUpload={setEditPhoto}
                  setIsUploading={setUploadingPhoto}
                  storagePath="properties"
                />
              </div>
              <div className="flex gap-2.5">
                <button
                  onClick={handleSaveEdit}
                  disabled={savingEdit || uploadingPhoto}
                  className="flex-1 h-11 rounded-full bg-apricot text-mulberry font-bold text-[14.5px] transition-opacity disabled:opacity-60"
                >
                  {savingEdit ? 'Saving…' : 'Save changes'}
                </button>
                <button
                  onClick={() => setEditing(false)}
                  disabled={savingEdit}
                  className="h-11 px-5 rounded-full bg-blush text-blush-copy font-bold text-[14.5px]"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <h1 className="font-display font-semibold text-[24px] leading-[1.15] text-mulberry dark:text-foreground">
                {property.name}
              </h1>
              <p className="mt-1 text-[13.5px] text-muted-copy">
                {property.address || 'No address yet'}
              </p>
            </>
          )}
        </div>
      </div>

      {/* Playbook — the property's one bundle (the convention, §1) */}
      <section className="mt-7">
        <SectionLabel>Playbook</SectionLabel>
        <div className="bg-card rounded-lg border border-card-border shadow-card">
          {guides.length === 0 ? (
            <p className="p-5 text-[13.5px] leading-[1.5] text-muted-copy">
              Nothing in the playbook yet. This is what guests see when they scan the QR — wifi,
              check-in, house quirks, local picks.
            </p>
          ) : (
            guides.map((g) => (
              <button
                key={g.id}
                onClick={() => navigate(`/guide/${g.id}`)}
                className="w-full px-4 py-3 flex items-center gap-3 border-b border-row-divider last:border-0 text-left transition-colors hover:bg-row-hover"
              >
                <GuideIcon
                  category={HOST_ICON_CATEGORY[g.category] || g.category}
                  iconName={g.icon}
                  size={38}
                />
                <span className="flex-1 min-w-0">
                  <span className="block font-bold text-[14.5px] text-mulberry dark:text-foreground truncate">
                    {g.name}
                  </span>
                  <span className="block text-[12px] text-muted-copy">{g.category}</span>
                </span>
                <span className="text-chevron">›</span>
              </button>
            ))
          )}
        </div>
        <button
          onClick={() =>
            navigate('/guide/new', {
              state: { hostBundleId: property.bundle_id, hostContext: true },
            })
          }
          className="mt-3 w-full h-11 rounded-full bg-apricot text-mulberry font-bold text-[14.5px]"
        >
          Add a guide
        </button>
        {starterKit && (
          <button
            onClick={() => handleAddBundleFromLibrary(starterKit)}
            className="mt-2 w-full h-11 rounded-full bg-blush text-blush-copy font-bold text-[14px]"
          >
            Start from the Host Starter Kit
          </button>
        )}
      </section>

      {/* Guest links — dated shares of the property's bundle */}
      <section className="mt-7">
        <SectionLabel>Guest links</SectionLabel>
        {links.length === 0 ? (
          <p className="text-[13.5px] text-muted-copy mb-3">
            No links yet — issue one per stay, dated to the check-out day.
          </p>
        ) : (
          <div className="space-y-2.5 mb-3">
            {links.map((l) => (
              <div
                key={l.id}
                className="bg-card rounded-lg border border-card-border shadow-card px-4 py-3 flex items-center gap-3"
              >
                <button
                  onClick={() => navigate(`/share-manage/${l.id}`)}
                  className="flex-1 min-w-0 text-left"
                >
                  <span className="block font-bold text-[14.5px] text-mulberry dark:text-foreground truncate">
                    {l.recipient_label || 'Guest link'}
                  </span>
                  <span
                    className={`block text-[12.5px] ${
                      isExpired(l.expires_at) ? 'text-chevron' : 'text-muted-copy'
                    }`}
                  >
                    {isExpired(l.expires_at) ? 'ended' : humanizeExpiry(l.expires_at)}
                  </span>
                </button>
                <button
                  onClick={() => navigate(`/host/property/${property.id}/qr-sheet?link=${l.id}`)}
                  className="flex-shrink-0 text-[13px] font-bold text-mulberry dark:text-foreground"
                >
                  Print QR sheet
                </button>
                <button
                  onClick={() => revokeLink(l.id)}
                  className="flex-shrink-0 text-[13px] font-bold text-coral"
                >
                  Turn off
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="bg-card rounded-lg border border-card-border shadow-card p-4">
          <div className="font-bold text-[14.5px] text-mulberry dark:text-foreground">
            New dated link
          </div>
          <p className="mt-0.5 text-[12.5px] text-muted-copy">
            It closes itself at the end of the check-out day.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2.5">
            <div>
              <FieldLabel htmlFor="stay-check-in">Check-in</FieldLabel>
              <input
                id="stay-check-in"
                type="date"
                value={checkin}
                onChange={(e) => setCheckin(e.target.value)}
                className="w-full h-11 px-3 rounded-lg border border-card-border bg-card text-[14px] text-mulberry dark:text-foreground"
              />
            </div>
            <div>
              <FieldLabel htmlFor="stay-check-out">Check-out</FieldLabel>
              <input
                id="stay-check-out"
                type="date"
                value={checkout}
                onChange={(e) => setCheckout(e.target.value)}
                className="w-full h-11 px-3 rounded-lg border border-card-border bg-card text-[14px] text-mulberry dark:text-foreground"
              />
            </div>
          </div>
          <button
            onClick={handleCreateLink}
            disabled={!checkout || creatingLink}
            className="mt-3 w-full h-11 rounded-full bg-apricot text-mulberry font-bold text-[14.5px] transition-opacity disabled:opacity-50"
          >
            {creatingLink ? 'Creating…' : 'Create the link'}
          </button>
        </div>
      </section>

      {/* Remove — the property row only; the playbook stays (§1) */}
      <div className="mt-8 text-center">
        {confirmingDelete ? (
          <div className="bg-card rounded-lg border border-card-border shadow-card p-4">
            <p className="text-[13.5px] leading-[1.5] text-body-copy dark:text-muted-foreground">
              Remove this property? Its playbook and guides stay in your library — only the
              property (and this page) goes away.
            </p>
            <div className="mt-3 flex justify-center gap-2.5">
              <button
                onClick={handleDelete}
                className="h-10 px-5 rounded-full bg-coral hover:bg-coral-hover text-cream font-bold text-[13.5px] transition-colors"
              >
                Remove property
              </button>
              <button
                onClick={() => setConfirmingDelete(false)}
                className="h-10 px-5 rounded-full bg-blush text-blush-copy font-bold text-[13.5px]"
              >
                Keep it
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setConfirmingDelete(true)}
            className="text-[13.5px] font-bold text-coral"
          >
            Remove this property…
          </button>
        )}
      </div>
    </div>
  );
};

export default HostPropertyDetail;
