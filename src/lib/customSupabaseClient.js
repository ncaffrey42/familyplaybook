import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ifdncylgiqhhcwovpdyf.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlmZG5jeWxnaXFoaGN3b3ZwZHlmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAxOTYwMTgsImV4cCI6MjA3NTc3MjAxOH0.hktyIYDMZQAUY1jycUN6OCII9ThDIXnREgnPuSnDHvw';

const customSupabaseClient = createClient(supabaseUrl, supabaseAnonKey);

export default customSupabaseClient;

export { 
    customSupabaseClient,
    customSupabaseClient as supabase,
};
