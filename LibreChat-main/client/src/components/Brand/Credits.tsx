import { useLocalize } from '~/hooks';

/**
 * `/credits` — endowGPT's attribution surface. Keeps every upstream license
 * notice user-visible in-product (the app may be self-hosted where `/licenses`
 * and repo files are less discoverable than they sound). Full text mirrors
 * LICENSES.md at the repository root.
 */
export default function Credits() {
  const localize = useLocalize();

  return (
    <div className="bg-surface-primary text-text-primary mx-auto w-full max-w-3xl px-4 py-8">
      <h1 className="mb-2 text-2xl font-semibold">
        {localize('com_ui_credits_heading')}
      </h1>
      <p className="text-text-secondary mb-8">{localize('com_ui_credits_intro')}</p>

      <section className="mb-8">
        <h2 className="text-text-primary mb-2 text-lg font-medium">endowGPT</h2>
        <p className="text-text-secondary text-sm">
          endowGPT is the deployment layer on top of the projects below: branding,
          package composition, the document editor, and app configuration. Brand
          assets (logo artwork and reveal animation) are endowGPT originals.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-text-primary mb-2 text-lg font-medium">LibreChat</h2>
        <p className="text-text-secondary mb-3 text-sm">
          The chat application, artifact system, and API server are modified builds of
          LibreChat, MIT License, Copyright (c) 2026 LibreChat. Full text in
          <code className="bg-surface-secondary mx-1 rounded px-1 font-mono text-xs">
            LICENSES.md
          </code>
          and
          <code className="bg-surface-secondary mx-1 rounded px-1 font-mono text-xs">
            LibreChat-main/LICENSE
          </code>
          .
        </p>
        <pre className="bg-surface-secondary text-text-primary max-h-96 overflow-auto rounded-lg p-3 font-mono text-xs leading-5">
{`MIT License

Copyright (c) 2026 LibreChat

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`}
        </pre>
      </section>

      <section className="mb-8">
        <h2 className="text-text-primary mb-2 text-lg font-medium">
          LibreChat RAG API
        </h2>
        <p className="text-text-secondary mb-3 text-sm">
          The retrieval service is the LibreChat RAG API, MIT License, Copyright (c)
          2024 Danny Avila. Full text in
          <code className="bg-surface-secondary mx-1 rounded px-1 font-mono text-xs">
            LICENSES.md
          </code>
          and
          <code className="bg-surface-secondary mx-1 rounded px-1 font-mono text-xs">
            rag-api-main/LICENSE
          </code>
          .
        </p>
        <pre className="bg-surface-secondary text-text-primary max-h-96 overflow-auto rounded-lg p-3 font-mono text-xs leading-5">
{`MIT License

Copyright (c) 2024 Danny Avila

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`}
        </pre>
      </section>

      <section>
        <h2 className="text-text-primary mb-2 text-lg font-medium">
          Runtime dependencies
        </h2>
        <p className="text-text-secondary text-sm">
          Bundled npm packages carry their own licenses (MIT, Apache-2.0, BSD, ISC,
          MPL-2.0, OFL, and CC-BY where noted). Notable UI libraries include TipTap
          (editor), marked and turndown (Markdown), diff (word diffs), docx (Word
          export), and jspdf (PDF export) — all MIT. A complete list is generated
          from the workspace lockfiles.
        </p>
      </section>
    </div>
  );
}
