import React, { useRef, useState, useMemo, useEffect, useCallback } from 'react';
import { Tools } from 'librechat-data-provider';
import type { CodeBarProps } from '~/common';
import FloatingCodeBar from '~/components/Messages/Content/FloatingCodeBar';
import ResultSwitcher from '~/components/Messages/Content/ResultSwitcher';
import { useToolCallsMapContext, useMessageContext } from '~/Providers';
import { LogContent } from '~/components/Chat/Messages/Content/Parts';
import CodeBar from '~/components/Messages/Content/CodeBar';
import { useLocalize } from '~/hooks';
import cn from '~/utils/cn';

type CodeBlockProps = Pick<
  CodeBarProps,
  'lang' | 'plugin' | 'error' | 'allowExecution' | 'blockIndex'
> & {
  codeChildren: React.ReactNode;
  classProp?: string;
};

const HTML_LANGUAGES = new Set(['html', 'htm', 'html5', 'xhtml']);

const isHtmlLanguage = (lang?: string): boolean =>
  lang != null && HTML_LANGUAGES.has(lang.toLowerCase());

/** Syntax highlighting hands us React elements, so the raw source is the
 *  concatenated text of their children. */
const textFromChildren = (node: React.ReactNode): string => {
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(textFromChildren).join('');
  }
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) {
    return textFromChildren(node.props.children);
  }
  return '';
};

/** Sandboxed previews have an opaque origin, where reading `localStorage`
 *  throws. Generated pages commonly keep a best score there, and the throw
 *  aborts the rest of their script (no board, no handlers). An in-memory
 *  shim keeps the sandbox's origin isolation while letting those pages run. */
const PREVIEW_STORAGE_SHIM = `<script>(function(){function createStore(){var data={};return {getItem:function(key){return Object.prototype.hasOwnProperty.call(data,key)?data[key]:null;},setItem:function(key,value){data[key]=String(value);},removeItem:function(key){delete data[key];},clear:function(){data={};},key:function(index){return Object.keys(data)[index]||null;},get length(){return Object.keys(data).length;}};}try{if(window.localStorage){return;}}catch(error){}try{Object.defineProperty(window,'localStorage',{configurable:true,value:createStore()});}catch(error){}try{Object.defineProperty(window,'sessionStorage',{configurable:true,value:createStore()});}catch(error){}})();</script>`;

const withPreviewShim = (html: string): string => {
  if (!html || !/<script[\s>]/i.test(html)) {
    return html;
  }
  const insert = (index: number) =>
    `${html.slice(0, index)}${PREVIEW_STORAGE_SHIM}${html.slice(index)}`;
  const doctype = /^\s*<!doctype[^>]*>/i.exec(html);
  if (doctype) {
    return insert(doctype.index + doctype[0].length);
  }
  const head = /<head[^>]*>/i.exec(html);
  if (head) {
    return insert(head.index + head[0].length);
  }
  const htmlTag = /<html[^>]*>/i.exec(html);
  if (htmlTag) {
    return insert(htmlTag.index + htmlTag[0].length);
  }
  const body = /<body[^>]*>/i.exec(html);
  if (body) {
    return insert(body.index + body[0].length);
  }
  return `<!DOCTYPE html><html><head>${PREVIEW_STORAGE_SHIM}</head><body>${html}</body></html>`;
};

const CodeBlock: React.FC<CodeBlockProps> = ({
  lang,
  blockIndex,
  codeChildren,
  classProp = '',
  allowExecution = true,
  plugin = null,
  error,
}) => {
  const localize = useLocalize();
  const codeRef = useRef<HTMLElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const codeBarRef = useRef<HTMLDivElement>(null);
  const codeText = useMemo(() => textFromChildren(codeChildren), [codeChildren]);
  const isNonCode = !!(plugin === true || error === true);
  const language = isNonCode ? 'json' : lang;
  const isHtml = !isNonCode && isHtmlLanguage(language);
  const isHtmlDocument = isHtml && /<!doctype\s+html|<html[\s>]/i.test(codeText);
  const [isHovered, setIsHovered] = useState(false);
  const [isCodeBarVisible, setIsCodeBarVisible] = useState(true);
  const [showPreview, setShowPreview] = useState(isHtmlDocument);
  const [previewHtml, setPreviewHtml] = useState(isHtmlDocument ? codeText : '');

  const toolCallsMap = useToolCallsMapContext();
  const { messageId, partIndex, isSubmitting } = useMessageContext();
  const key = allowExecution
    ? `${messageId}_${partIndex ?? 0}_${blockIndex ?? 0}_${Tools.execute_code}`
    : '';
  const [currentIndex, setCurrentIndex] = useState(0);

  const fetchedToolCalls = toolCallsMap?.[key];
  const [toolCalls, setToolCalls] = useState(toolCallsMap?.[key] ?? null);

  useEffect(() => {
    if (fetchedToolCalls) {
      setToolCalls(fetchedToolCalls);
      setCurrentIndex(fetchedToolCalls.length - 1);
    }
  }, [fetchedToolCalls]);

  useEffect(() => {
    const el = codeBarRef.current;
    if (!el) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => setIsCodeBarVisible(entry.isIntersecting),
      { root: null, threshold: 0 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const handleFocus = useCallback(() => setIsHovered(true), []);

  const handleBlur = useCallback((e: React.FocusEvent) => {
    if (!containerRef.current?.contains(e.relatedTarget as Node)) {
      setIsHovered(false);
    }
  }, []);

  const handleMouseEnter = useCallback(() => setIsHovered(true), []);

  const handleMouseLeave = useCallback(() => {
    if (!containerRef.current?.contains(document.activeElement)) {
      setIsHovered(false);
    }
  }, []);

  const currentToolCall = useMemo(() => toolCalls?.[currentIndex], [toolCalls, currentIndex]);

  const next = useCallback(() => {
    if (toolCalls && currentIndex < toolCalls.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  }, [toolCalls, currentIndex]);

  const previous = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  }, [currentIndex]);

  const showHtmlPreview = isHtml && showPreview;
  const showFloating = isHovered && !isCodeBarVisible;

  /** The source is already in hand; the DOM is only a fallback for children
   *  that syntax highlighting may have left as non-text nodes. */
  const togglePreview = useCallback(() => {
    if (!showPreview) {
      setPreviewHtml(codeText || codeRef.current?.textContent || '');
    }
    setShowPreview((active) => !active);
  }, [showPreview, codeText]);

  /** Streaming rewrites the source token by token; reloading the iframe each
   *  time would flicker and restart any script. Refresh once it settles. */
  useEffect(() => {
    if (!showPreview || isSubmitting === true) {
      return;
    }
    setPreviewHtml(codeText || codeRef.current?.textContent || '');
  }, [showPreview, isSubmitting, codeText]);

  useEffect(() => {
    if (isHtml) {
      return;
    }
    setShowPreview(false);
    setPreviewHtml('');
  }, [isHtml]);

  return (
    <div
      ref={containerRef}
      className="border-border-inset relative w-full overflow-hidden rounded-xl border text-xs"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleFocus}
      onBlur={handleBlur}
    >
      <div ref={codeBarRef}>
        <CodeBar
          lang={lang}
          error={error}
          codeRef={codeRef}
          blockIndex={blockIndex}
          plugin={plugin === true}
          allowExecution={allowExecution}
          previewActive={showPreview}
          onTogglePreview={isHtml ? togglePreview : undefined}
        />
      </div>
      {showHtmlPreview && (
        <iframe
          title={localize('com_ui_preview')}
          srcDoc={withPreviewShim(previewHtml)}
          sandbox="allow-scripts"
          referrerPolicy="no-referrer"
          className={cn(
            'bg-surface-primary w-full border-0',
            isHtmlDocument ? 'h-[40rem] max-h-[80vh]' : 'h-[24rem] max-h-[70vh]',
          )}
          data-testid="html-code-preview"
        />
      )}
      <div
        dir="ltr"
        className={cn(
          classProp,
          'bg-surface-code-body overflow-y-auto p-4',
          showHtmlPreview && 'hidden',
        )}
      >
        <code
          ref={codeRef}
          className={cn(
            isNonCode ? '!whitespace-pre-wrap' : `hljs language-${language} !whitespace-pre`,
          )}
        >
          {codeChildren}
        </code>
      </div>
      <FloatingCodeBar
        lang={lang}
        error={error}
        codeRef={codeRef}
        blockIndex={blockIndex}
        plugin={plugin === true}
        allowExecution={allowExecution}
        previewActive={showPreview}
        onTogglePreview={isHtml ? togglePreview : undefined}
        isVisible={showFloating}
      />
      {allowExecution === true && toolCalls && toolCalls.length > 0 && (
        <>
          <div dir="ltr" className="border-border-inset bg-surface-code border-t p-4 text-xs">
            <div className="text-text-secondary text-3xs mb-1 font-medium tracking-wide uppercase">
              {localize('com_ui_output')}
            </div>
            <div className="text-text-primary flex flex-col-reverse">
              <pre className="shrink-0">
                <LogContent
                  output={(currentToolCall?.result as string | undefined) ?? ''}
                  attachments={currentToolCall?.attachments ?? []}
                  renderImages={true}
                />
              </pre>
            </div>
          </div>
          {toolCalls.length > 1 && (
            <ResultSwitcher
              currentIndex={currentIndex}
              totalCount={toolCalls.length}
              onPrevious={previous}
              onNext={next}
            />
          )}
        </>
      )}
    </div>
  );
};

export default CodeBlock;
