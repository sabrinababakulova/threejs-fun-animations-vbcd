import type { Metadata } from 'next';
import MikuViewer from '@/components/miku-viewer';

export const metadata: Metadata = {
  title: 'Hatsune Miku · Character Study',
  description:
    'Explore Hatsune Miku in 3D, with flowing turquoise twin-tails, her classic outfit, and studio lighting.',
};

export default function MikuPage() {
  return <MikuViewer />;
}
