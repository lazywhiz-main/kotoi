import { useCallback, useEffect, useState } from 'react';

import {
  canStartGraphicRec,
  entitlementOf,
  type GraphicRecGate,
  type SubscriptionRow,
} from '@/lib/entitlements';
import { getSupabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';

export function useSubscription() {
  const { user, session } = useAuth();
  const [subscription, setSubscription] = useState<SubscriptionRow | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user?.id) {
      setSubscription(null);
      setLoading(false);
      return null;
    }
    const supabase = getSupabase();
    if (!supabase) {
      setLoading(false);
      return null;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from('subscriptions')
      .select(
        'user_id, trial_state, trial_started_at, trial_achieved_at, paywall_shown_at, free_graphic_rec_exploration_id, plan, is_student, student_verified_at, store, store_txn_id, current_period_start, current_period_end, cancelled_at, created_at, updated_at',
      )
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) {
      console.warn('subscriptions fetch failed', error.message);
      setSubscription(null);
      setLoading(false);
      return null;
    }

    // 行が無い既存ユーザー向け: Edge 側 ensure に任せるので null のままでも可
    setSubscription((data as SubscriptionRow | null) ?? null);
    setLoading(false);
    return (data as SubscriptionRow | null) ?? null;
  }, [user?.id]);

  useEffect(() => {
    void refresh();
  }, [refresh, session?.access_token]);

  const entitlement = subscription ? entitlementOf(subscription) : 'full';

  const graphicGateFor = useCallback(
    (explorationId: string): GraphicRecGate => {
      if (!subscription) return 'allow';
      return canStartGraphicRec(subscription, explorationId);
    },
    [subscription],
  );

  return {
    subscription,
    loading,
    entitlement,
    refresh,
    graphicGateFor,
    isReadOnly: entitlement === 'read_only',
  };
}
