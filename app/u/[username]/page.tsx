'use client';
import { use, useEffect, useState } from 'react';
import { PublicProfileView } from '@/components/PublicProfileView';
import { TitleDetail } from '@/components/TitleDetail';
import type { User } from '@/lib/types';
import { api } from '@/components/client';

export default function UserProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = use(params);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [selectedTitleId, setSelectedTitleId] = useState<string | null>(null);

  useEffect(() => {
    api<{ user: User | null }>('/auth/me')
      .then((res) => setCurrentUser(res.user))
      .catch(() => setCurrentUser(null));
  }, []);

  return (
    <div className="min-h-screen">
      <PublicProfileView
        username={username}
        currentUser={currentUser}
        onOpenTitle={(id) => setSelectedTitleId(id)}
      />

      {selectedTitleId && (
        <TitleDetail
          id={selectedTitleId}
          initialTab="overview"
          onClose={() => setSelectedTitleId(null)}
        />
      )}
    </div>
  );
}
