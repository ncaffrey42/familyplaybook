/* eslint-env node */
import process from 'process';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

// Safe environment variable access
const env = typeof process !== 'undefined' ? process.env : {};

const supabaseUrl = env.VITE_SUPABASE_URL;
const supabaseServiceKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Supabase URL or Service Role Key is not defined in your environment variables.');
  if (typeof process !== 'undefined' && process.exit) {
    process.exit(1);
  }
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function fixPackImages() {
  console.log('Fetching packs with missing or empty images...');

  const { data: packs, error: packsError } = await supabase
    .from('packs')
    .select('id, name')
    .or('image.is.null,image.eq.');

  if (packsError) {
    console.error('Error fetching packs:', packsError.message);
    return;
  }

  if (!packs || packs.length === 0) {
    console.log('No packs found with missing images. All good! ✨');
    return;
  }

  console.log(`Found ${packs.length} packs to fix. Starting image generation...`);

  for (const pack of packs) {
    console.log(`Generating image for pack: "${pack.name}" (ID: ${pack.id})`);
    try {
      const { data: functionData, error: functionError } = await supabase.functions.invoke('generate-pack-image', {
        body: JSON.stringify({ packName: pack.name }),
      });

      if (functionError) {
        throw functionError;
      }

      const { imageUrl } = functionData;

      if (imageUrl) {
        const { error: updateError } = await supabase
          .from('packs')
          .update({ image: imageUrl })
          .eq('id', pack.id);

        if (updateError) {
          console.error(`Failed to update image for pack "${pack.name}":`, updateError.message);
        } else {
          console.log(`✅ Successfully updated image for pack "${pack.name}"`);
        }
      } else {
        console.warn(`Image generation returned no URL for pack "${pack.name}"`);
      }
    } catch (error) {
      console.error(`An error occurred while processing pack "${pack.name}":`, error.message);
    }
  }

  console.log('Image backfill process complete! 🎉');
}

fixPackImages();