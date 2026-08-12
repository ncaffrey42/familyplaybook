import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import QRCode from 'qrcode.react';
import { Helmet } from 'react-helmet';
import { supabase } from '@/lib/supabaseClient';

/**
 * Printable QR sheet — the one genuinely new surface of the properties
 * build (docs/platform/PROPERTIES.md §3): property name, the QR for one
 * guest link, the short URL, and the "just ask" line for Ask the Playbook.
 *
 * Mounted OUTSIDE the HostShell layout — but inside the same
 * HOST_PRODUCT_ENABLED route block in App.jsx — so the page carries no app
 * chrome (no KPI header, no bottom nav) and @media print has nothing to
 * hide except this screen's own on-screen controls.
 */
const HostQrSheet = () => {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const shareId = searchParams.get('link');

  const [propertyName, setPropertyName] = useState('');

  useEffect(() => {
    if (!id) return undefined;
    let cancelled = false;
    supabase
      .from('properties')
      .select('name')
      .eq('id', id)
      .single()
      .then(({ data }) => {
        if (!cancelled && data?.name) setPropertyName(data.name);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const shareUrl = shareId ? `${window.location.origin}/share/${shareId}` : '';

  return (
    <>
      <Helmet>
        <title>QR sheet - Family Playbook</title>
      </Helmet>
      <div className="min-h-screen bg-cream print:bg-white px-[22px] py-8">
        {/* The app shell's body background isn't ours to restyle with a
            class, so force it white for print here. */}
        <style>{'@media print { body { background: #fff; } }'}</style>
        <div className="max-w-md mx-auto">
          <div className="flex items-center justify-between print:hidden">
            <button
              onClick={() => navigate(`/host/property/${id}`)}
              className="text-[14px] font-bold text-muted-copy"
            >
              ‹ Back
            </button>
            {shareId && (
              <button
                onClick={() => window.print()}
                className="h-10 px-6 rounded-full bg-apricot text-mulberry font-bold text-[14px]"
              >
                Print
              </button>
            )}
          </div>

          {!shareId ? (
            <div className="mt-6 bg-card rounded-lg border border-card-border shadow-card p-6 text-center">
              <p className="font-display font-semibold text-[19px] text-mulberry">
                No link to print
              </p>
              <p className="mt-1 text-[13.5px] text-muted-copy">
                Open this sheet from one of the property's guest links.
              </p>
            </div>
          ) : (
            <div className="mt-6 print:mt-0 bg-white rounded-2xl border border-card-border shadow-card print:border-0 print:shadow-none p-8 text-center">
              <div className="text-[11px] font-bold uppercase tracking-[0.13em] text-apricot">
                Welcome to
              </div>
              <h1 className="mt-1 font-display font-semibold text-[30px] leading-[1.1] text-mulberry">
                {propertyName || 'Your stay'}
              </h1>
              <div className="mt-7 flex justify-center">
                <QRCode value={shareUrl} size={232} level={'H'} includeMargin={false} fgColor="#5C2A3E" />
              </div>
              <div className="mt-5 text-[14px] text-body-copy break-all">{shareUrl}</div>
              <p className="mt-6 text-[14.5px] leading-[1.55] text-body-copy">
                Questions? Just ask on that page — type what you need and get an answer from this
                home's guides.
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default HostQrSheet;
