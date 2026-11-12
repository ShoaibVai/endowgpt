import PptxGenJS from 'pptxgenjs';
import type { GeneratedFileLimits } from './limits';
import type { NormalizedPresentationInput } from './schema';
import type { RenderedGeneratedFile } from './types';
import { GENERATED_FORMAT_MIME_TYPES } from './types';

/** Renders a validated deck to pptx bytes. */
export async function renderPresentation(
  input: NormalizedPresentationInput,
  limits: GeneratedFileLimits,
): Promise<RenderedGeneratedFile> {
  const presentation = new PptxGenJS();
  presentation.layout = 'LAYOUT_WIDE';
  presentation.author = 'endowGPT';
  presentation.company = 'endowGPT';
  presentation.subject = 'Generated presentation';
  presentation.title = input.filename;

  input.slides.forEach((slideInput, index) => {
    const slide = presentation.addSlide();
    slide.background = { color: 'F8FAFC' };

    slide.addText(slideInput.title, {
      x: 0.6,
      y: 0.4,
      w: 12.1,
      h: 0.8,
      fontSize: 28,
      bold: true,
      color: '0F172A',
      fontFace: 'Aptos Display',
      valign: 'middle',
    });

    slide.addShape(presentation.ShapeType.rect, {
      x: 0.6,
      y: 1.22,
      w: 1.3,
      h: 0.06,
      fill: { color: '2563EB' },
      line: { color: '2563EB' },
    });

    const hasImage = slideInput.image != null;
    if (slideInput.bullets.length > 0) {
      slide.addText(
        slideInput.bullets.map((bullet) => ({
          text: bullet,
          options: { bullet: true, breakLine: true },
        })),
        {
          x: 0.8,
          y: 1.55,
          w: hasImage ? 7.1 : 11.7,
          h: hasImage ? 5.0 : 5.2,
          fontSize: 18,
          color: '334155',
          fontFace: 'Aptos',
          valign: 'top',
          paraSpaceAfter: 8,
        },
      );
    }

    if (hasImage) {
      slide.addImage({
        data: slideInput.image,
        x: 8.25,
        y: 1.55,
        w: 4.45,
        h: 4.0,
      });
    }

    if (slideInput.notes != null) {
      slide.addNotes(slideInput.notes);
    }

    slide.addText(`${index + 1}`, {
      x: 12.35,
      y: 7.0,
      w: 0.55,
      h: 0.3,
      fontSize: 10,
      color: '94A3B8',
      align: 'right',
      fontFace: 'Aptos',
    });
  });

  const output = (await presentation.write({ outputType: 'nodebuffer' })) as unknown as Buffer;
  const buffer = Buffer.isBuffer(output) ? output : Buffer.from(output as Uint8Array);
  if (buffer.length > limits.maxBytes) {
    throw new Error(`The generated PPTX file exceeds the ${limits.maxBytes} byte limit`);
  }

  return {
    buffer,
    filename: input.filename,
    format: 'pptx',
    mimeType: GENERATED_FORMAT_MIME_TYPES.pptx,
    counts: {
      version: 1,
      tool: 'create_presentation',
      kind: 'presentation',
      format: 'pptx',
      slides: input.slides.length,
    },
  };
}
