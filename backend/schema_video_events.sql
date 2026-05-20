-- =====================================================
-- Aegis Tactical — Video Events Schema Extension
-- =====================================================
-- SAFETY: Does NOT modify existing tables.
-- Only creates the new video_events table.
-- =====================================================

-- 🎬 VIDEO INTELLIGENCE: CREATE VIDEO EVENTS TABLE
CREATE TABLE IF NOT EXISTS public.video_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  timestamp TIMESTAMPTZ DEFAULT now(),
  event_type TEXT NOT NULL DEFAULT 'unknown',
  severity TEXT NOT NULL DEFAULT 'low',
  confidence DOUBLE PRECISION DEFAULT 0.0,
  objects_detected JSONB DEFAULT '[]'::jsonb,
  latitude DOUBLE PRECISION DEFAULT 0.0,
  longitude DOUBLE PRECISION DEFAULT 0.0,
  video_source TEXT DEFAULT 'unknown',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_video_events_time
  ON public.video_events (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_video_events_severity
  ON public.video_events (severity);

CREATE INDEX IF NOT EXISTS idx_video_events_type
  ON public.video_events (event_type);

CREATE INDEX IF NOT EXISTS idx_video_events_location
  ON public.video_events (latitude, longitude);

-- Enable Row Level Security (optional, matches Supabase best practices)
ALTER TABLE public.video_events ENABLE ROW LEVEL SECURITY;

-- Allow anon/authenticated read/write (matches existing Aegis pattern)
CREATE POLICY IF NOT EXISTS "Allow all access to video_events"
  ON public.video_events
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Add comment for documentation
COMMENT ON TABLE public.video_events IS 
  'Aegis Tactical Video Intelligence — stores AI-detected events from video feeds';
