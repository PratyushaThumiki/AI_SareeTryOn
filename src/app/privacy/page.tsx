import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy — Virtual Try-On',
  description: 'How your camera and personal data are handled by the virtual try-on platform.',
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-ink pb-20">
      <header className="sticky top-0 z-10 border-b border-edge bg-ink/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-4">
          <Link href="/" className="text-sm text-muted hover:text-white">
            ← Back to catalog
          </Link>
          <h1 className="font-display text-lg font-semibold text-white">Privacy</h1>
          <div className="w-16" />
        </div>
      </header>

      <article className="mx-auto max-w-3xl space-y-10 px-5 py-10">
        {/* TL;DR callout */}
        <div className="rounded-2xl border border-privacyOk/30 bg-panel px-6 py-5">
          <div className="flex items-start gap-3">
            <span className="text-2xl">🔒</span>
            <div>
              <p className="font-semibold text-white text-base">
                Your camera stays on your device. Always.
              </p>
              <p className="mt-1 text-sm text-muted">
                This platform was designed from the ground up so that your camera feed, body images, and
                biometric data never leave your browser tab. This is a technical guarantee, not just a
                policy statement — there is no server endpoint that could accept your image even if we
                wanted to send it.
              </p>
            </div>
          </div>
        </div>

        <Section title="What happens when you use the try-on feature">
          <ul className="list-none space-y-3">
            <LiCheck>
              <strong>Camera access is requested from your browser.</strong> This happens only on your
              device and requires your explicit permission via the standard browser prompt.
            </LiCheck>
            <LiCheck>
              <strong>All computer vision runs locally in your browser.</strong> Pose estimation and
              person segmentation are performed by WebAssembly code running inside your browser tab.
              No pixels are encoded and sent over the network.
            </LiCheck>
            <LiCheck>
              <strong>Garment images are fetched from our server.</strong> We download the saree image
              assets to your device, then composite them over your local camera feed. Only the product
              image travels over the network, never your camera image.
            </LiCheck>
            <LiCheck>
              <strong>Snapshots you take stay on your device.</strong> The optional snapshot feature
              creates a JPEG in your browser memory. You can save it locally or discard it. It is never
              uploaded.
            </LiCheck>
          </ul>
        </Section>

        <Section title="What we never do">
          <ul className="list-none space-y-3">
            <LiX>Upload camera frames to any server</LiX>
            <LiX>Upload or store photographs of you</LiX>
            <LiX>Extract or store face embeddings or biometric identifiers</LiX>
            <LiX>Send your body image to an AI model hosted in the cloud</LiX>
            <LiX>Use third-party analytics that have access to the camera</LiX>
            <LiX>Store raw video streams</LiX>
            <LiX>Require account creation or login</LiX>
          </ul>
        </Section>

        <Section title="Technical implementation">
          <Table
            rows={[
              ['Camera stream access', 'Browser-local only', '✅ On device'],
              ['Pose estimation', 'MediaPipe WASM in-browser', '✅ On device'],
              ['Person segmentation', 'MediaPipe WASM in-browser', '✅ On device'],
              ['Garment rendering', 'Canvas 2D / local', '✅ On device'],
              ['Product catalog (saree data)', 'Fetched from our API', '🌐 Server'],
              ['Product images (saree PNGs/SVGs)', 'Fetched from our API or CDN', '🌐 Server'],
              ['Snapshot (if taken)', 'Stays in browser memory', '✅ On device'],
              ['Application telemetry', 'None collected', '— None'],
            ]}
          />
        </Section>

        <Section title="On-device ML models">
          <p className="text-muted text-sm leading-relaxed">
            We use{' '}
            <a
              href="https://developers.google.com/mediapipe"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent underline-offset-2 hover:underline"
            >
              MediaPipe Tasks Vision
            </a>{' '}
            (Apache 2.0 license) for pose estimation and person segmentation. These models are
            downloaded to your browser on first use and cached. They run in a WebAssembly sandbox
            and can use your device's GPU for acceleration via the WebGL delegate. At no point does
            MediaPipe connect to an external API during inference — inference is 100% local.
          </p>
        </Section>

        <Section title="Cookies and tracking">
          <p className="text-muted text-sm leading-relaxed">
            We do not set analytics cookies. The application may use{' '}
            <code className="text-xs text-accent">localStorage</code> to cache your selected saree
            preference between visits. This data is stored exclusively in your browser and is not
            accessible to us.
          </p>
        </Section>

        <Section title="Browser compatibility and fallback">
          <p className="text-muted text-sm leading-relaxed">
            If your browser does not support the required WebAssembly or camera APIs, the application
            will show a fallback message explaining why try-on is unavailable on your device. It will
            not attempt a cloud-based alternative that would involve uploading your image.
          </p>
        </Section>

        <Section title="Content Security Policy">
          <p className="text-muted text-sm leading-relaxed">
            Our server sends a strict{' '}
            <a
              href="https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent underline-offset-2 hover:underline"
            >
              Content Security Policy
            </a>{' '}
            header with every response. This instructs your browser to block any network connection
            that is not on an explicit allow-list. The camera-data endpoints are not on that list, so
            even a rogue script injected into the page could not upload your image.
          </p>
        </Section>

        <Section title="Contact">
          <p className="text-muted text-sm">
            Questions about privacy? Email{' '}
            <span className="text-accent">privacy@example.com</span> (replace with your actual
            contact address before shipping).
          </p>
        </Section>

        <p className="text-xs text-edge pt-4">Last updated: September 2026</p>
      </article>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="font-display text-lg font-semibold text-white mb-3">{title}</h2>
      {children}
    </section>
  );
}

function LiCheck({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5 text-sm text-muted">
      <span className="mt-0.5 shrink-0 text-privacyOk">✓</span>
      <span>{children}</span>
    </li>
  );
}

function LiX({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5 text-sm text-muted">
      <span className="mt-0.5 shrink-0 text-danger">✕</span>
      <span>{children}</span>
    </li>
  );
}

function Table({ rows }: { rows: string[][] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-edge">
      <table className="w-full text-sm text-left">
        <thead>
          <tr className="border-b border-edge bg-panel">
            <th className="px-4 py-3 text-white font-medium">Operation</th>
            <th className="px-4 py-3 text-white font-medium">How it works</th>
            <th className="px-4 py-3 text-white font-medium">Location</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([op, how, loc], i) => (
            <tr key={i} className="border-b border-edge last:border-none hover:bg-surface/50">
              <td className="px-4 py-2.5 text-white">{op}</td>
              <td className="px-4 py-2.5 text-muted">{how}</td>
              <td className="px-4 py-2.5">
                <span
                  className={
                    loc?.startsWith('✅')
                      ? 'text-privacyOk'
                      : loc?.startsWith('🌐')
                      ? 'text-accent'
                      : 'text-muted'
                  }
                >
                  {loc}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
