import { useEffect, useRef, useCallback } from 'react';
import { supabase, isSupabaseConfigured } from '../services/supabase';

/**
 * Syncs the local todoTabs array to Supabase when a user is signed in.
 *
 * Each tab maps to one row in the `todo_tabs` table.
 * The full items array is stored as JSONB — tasks are short text so this
 * avoids a separate items table while keeping things simple.
 */
export function useTasksSync({ user, todoTabs, setTodoTabs }) {
  const syncedRef = useRef(false);
  const userIdRef = useRef(null);

  // ── Initial load ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isSupabaseConfigured || !user) {
      syncedRef.current = false;
      userIdRef.current = null;
      return;
    }

    if (userIdRef.current === user.id && syncedRef.current) return;
    userIdRef.current = user.id;

    const fetchRemote = async () => {
      const { data, error } = await supabase
        .from('todo_tabs')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('[TasksSync] fetch error:', error.message);
        return;
      }

      if (!data?.length) {
        uploadAll(todoTabs, user.id);
        syncedRef.current = true;
        return;
      }

      const remoteById = Object.fromEntries(data.map(t => [t.local_id, toLocal(t)]));

      setTodoTabs(prev => {
        const merged = prev.map(local =>
          remoteById[local.id]
            ? (remoteById[local.id].updatedAt >= (local.updatedAt ?? 0)
                ? remoteById[local.id]
                : local)
            : local
        );
        const localIds = new Set(prev.map(t => t.id));
        for (const [id, remote] of Object.entries(remoteById)) {
          if (!localIds.has(Number(id))) merged.push(remote);
        }
        return merged;
      });

      syncedRef.current = true;
    };

    fetchRemote();
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Upsert a single tab ──────────────────────────────────────────────────────
  const upsertTab = useCallback(async (tab, userId) => {
    if (!isSupabaseConfigured || !userId) return;
    const { error } = await supabase.from('todo_tabs').upsert(toRemote(tab, userId), {
      onConflict: 'user_id,local_id'
    });
    if (error) console.error('[TasksSync] upsert error:', error.message);
  }, []);

  // ── Delete a tab ─────────────────────────────────────────────────────────────
  const deleteTab = useCallback(async (localId, userId) => {
    if (!isSupabaseConfigured || !userId) return;
    const { error } = await supabase
      .from('todo_tabs')
      .delete()
      .eq('user_id', userId)
      .eq('local_id', localId);
    if (error) console.error('[TasksSync] delete error:', error.message);
  }, []);

  // ── Upload all tabs (first sign-in) ──────────────────────────────────────────
  const uploadAll = useCallback(async (tabs, userId) => {
    if (!isSupabaseConfigured || !userId) return;
    const rows = tabs.map(t => toRemote(t, userId));
    const { error } = await supabase.from('todo_tabs').upsert(rows, {
      onConflict: 'user_id,local_id'
    });
    if (error) console.error('[TasksSync] uploadAll error:', error.message);
  }, []);

  return { upsertTab, deleteTab };
}

// ── Shape converters ──────────────────────────────────────────────────────────

function toRemote(tab, userId) {
  return {
    user_id: userId,
    local_id: tab.id,
    title: tab.title ?? 'List',
    items: tab.items ?? [],
    updated_at: new Date(tab.updatedAt ?? Date.now()).toISOString(),
    created_at: new Date(tab.createdAt ?? Date.now()).toISOString(),
  };
}

function toLocal(row) {
  return {
    id: row.local_id,
    title: row.title ?? 'List',
    items: row.items ?? [],
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
  };
}
