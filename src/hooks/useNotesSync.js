import { useEffect, useRef, useCallback } from 'react';
import { supabase, isSupabaseConfigured } from '../services/supabase';

/**
 * Syncs the local notes array to Supabase when a user is signed in.
 *
 * Strategy:
 * - On sign-in: fetch all notes for the user and merge into local state
 *   (remote wins for notes that exist on both sides; local-only notes are uploaded).
 * - On note create/update: upsert the row.
 * - On note delete/archive: update the row (soft deletes are preserved).
 *
 * Images remain as base64 data URLs stored in the `content_images` JSONB column
 * for now. A future migration can move them to Supabase Storage.
 */
export function useNotesSync({ user, notes, setNotes }) {
  const syncedRef = useRef(false);
  const userIdRef = useRef(null);

  // ── Initial load: fetch remote notes when user signs in ─────────────────────
  useEffect(() => {
    if (!isSupabaseConfigured || !user) {
      syncedRef.current = false;
      userIdRef.current = null;
      return;
    }

    if (userIdRef.current === user.id && syncedRef.current) return;

    userIdRef.current = user.id;

    const fetchRemoteNotes = async () => {
      const { data, error } = await supabase
        .from('notes')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('[NotesSync] fetch error:', error.message);
        return;
      }

      if (!data?.length) {
        // No remote notes yet — push local notes up
        uploadAll(notes, user.id);
        syncedRef.current = true;
        return;
      }

      // Merge: build a map of remote notes by id
      const remoteById = Object.fromEntries(data.map(n => [n.local_id, toLocal(n)]));

      setNotes(prev => {
        const merged = prev.map(local => remoteById[local.id]
          // Remote is newer → use remote version
          ? (remoteById[local.id].updatedAt >= local.updatedAt ? remoteById[local.id] : local)
          : local
        );
        // Add remote notes not present locally
        const localIds = new Set(prev.map(n => n.id));
        for (const [id, remote] of Object.entries(remoteById)) {
          if (!localIds.has(Number(id))) merged.push(remote);
        }
        return merged;
      });

      syncedRef.current = true;
    };

    fetchRemoteNotes();
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Upsert a single note ─────────────────────────────────────────────────────
  const upsertNote = useCallback(async (note, userId) => {
    if (!isSupabaseConfigured || !userId) return;
    const { error } = await supabase.from('notes').upsert(toRemote(note, userId), {
      onConflict: 'user_id,local_id'
    });
    if (error) console.error('[NotesSync] upsert error:', error.message);
  }, []);

  // ── Upload all local notes (first sign-in) ───────────────────────────────────
  const uploadAll = useCallback(async (localNotes, userId) => {
    if (!isSupabaseConfigured || !userId) return;
    const rows = localNotes.map(n => toRemote(n, userId));
    const { error } = await supabase.from('notes').upsert(rows, {
      onConflict: 'user_id,local_id'
    });
    if (error) console.error('[NotesSync] uploadAll error:', error.message);
  }, []);

  return { upsertNote, syncedRef };
}

// ── Shape converters ─────────────────────────────────────────────────────────

function toRemote(note, userId) {
  return {
    user_id: userId,
    local_id: note.id,
    folder_local_id: note.folderId,
    title: note.title ?? '',
    content: note.content ?? '',
    content_images: note.images ?? [],
    pinned: note.pinned ?? false,
    archived: note.archived ?? false,
    created_at: new Date(note.createdAt).toISOString(),
    updated_at: new Date(note.updatedAt).toISOString(),
  };
}

function toLocal(row) {
  return {
    id: row.local_id,
    folderId: row.folder_local_id ?? null,
    title: row.title ?? '',
    content: row.content ?? '',
    images: row.content_images ?? [],
    pinned: row.pinned ?? false,
    archived: row.archived ?? false,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
  };
}
