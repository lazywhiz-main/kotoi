import { invokeFunction } from '@/lib/api';

export async function deleteAccount(): Promise<void> {
  await invokeFunction<{ ok: boolean }>('delete-account', { confirm: 'DELETE' });
}
