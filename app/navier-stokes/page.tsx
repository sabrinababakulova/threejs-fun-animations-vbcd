import type { Metadata } from 'next';
import NavierStokesViewer from '@/components/navier-stokes-viewer';

export const metadata: Metadata = {
  title: 'Navier–Stokes · Vortex Study',
  description:
    'An interactive Three.js vortex with animated flow, adjustable viscosity and speed, and a singularity illustration inspired by OpenAI’s Navier–Stokes research.',
};

export default function NavierStokesPage() {
  return <NavierStokesViewer />;
}
