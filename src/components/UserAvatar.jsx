import React from 'react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

/**
 * Renders the signed-in user's avatar with an initials fallback.
 *
 * Pulls `avatar_url` / `full_name` from the auth profile (with
 * user_metadata as a fallback for OAuth signups). Pass `className` to
 * size or restyle — the Avatar primitive will inherit those styles.
 */
const UserAvatar = ({ className, fallbackClassName }) => {
  const { user, profile } = useAuth();

  const avatarUrl =
    profile?.avatar_url || user?.user_metadata?.avatar_url || undefined;

  const sourceName =
    profile?.full_name ||
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    user?.email ||
    '';
  const initial = (sourceName.trim()?.[0] || '?').toUpperCase();

  return (
    <Avatar className={cn('h-8 w-8', className)}>
      <AvatarImage src={avatarUrl} alt="" />
      <AvatarFallback className={cn('text-xs font-semibold', fallbackClassName)}>
        {initial}
      </AvatarFallback>
    </Avatar>
  );
};

export default UserAvatar;
