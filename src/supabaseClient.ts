import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://pahmorxorucpioppmjza.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBhaG1vcnhvcnVjcGlvcHBtanphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYzMjE4MDAsImV4cCI6MjA4MTg5NzgwMH0.W0Nle409r_pKc3xsJhbVTBgjfLVJWLpWXs8lupx-qnw'

export const supabase = createClient(supabaseUrl, supabaseKey)