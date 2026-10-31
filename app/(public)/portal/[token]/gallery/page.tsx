import { redirect } from 'next/navigation';

export default function PortalGalleryPage({ params }: { params: { token: string } }) {
  redirect(`/portal/${params.token}#gallery`);
}

