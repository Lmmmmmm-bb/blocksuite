import type { BlockCollection, DocCollection } from '@blocksuite/store';

import { BlockServiceWatcher, type EditorHost } from '@blocksuite/block-std';
import { type PageRootService, SpecProvider } from '@blocksuite/blocks';
import { AffineFormatBarWidget } from '@blocksuite/blocks';
import {
  DocMode,
  DocModeProvider,
  toolbarDefaultConfig,
} from '@blocksuite/blocks';
import { assertExists } from '@blocksuite/global/utils';
import { AffineEditorContainer, CommentPanel } from '@blocksuite/presets';

import { CustomChatPanel } from '../../_common/components/custom-chat-panel.js';
import { CustomFramePanel } from '../../_common/components/custom-frame-panel.js';
import { CustomOutlinePanel } from '../../_common/components/custom-outline-panel.js';
import { CustomOutlineViewer } from '../../_common/components/custom-outline-viewer.js';
import { DebugMenu } from '../../_common/components/debug-menu.js';
import { DocsPanel } from '../../_common/components/docs-panel.js';
import { LeftSidePanel } from '../../_common/components/left-side-panel.js';
import { SidePanel } from '../../_common/components/side-panel.js';
import {
  mockNotificationService,
  mockQuickSearchService,
} from '../../_common/mock-services';

function setDocModeFromUrlParams(service: DocModeProvider) {
  const params = new URLSearchParams(location.search);
  const paramMode = params.get('mode');
  if (paramMode) {
    const docMode = paramMode === 'page' ? DocMode.Page : DocMode.Edgeless;
    service.setMode(docMode);
  }
}

function configureFormatBar(formatBar: AffineFormatBarWidget) {
  toolbarDefaultConfig(formatBar);
}

export async function mountDefaultDocEditor(collection: DocCollection) {
  const blockCollection = collection.docs.values().next()
    .value as BlockCollection;
  assertExists(blockCollection, 'Need to create a doc first');
  const doc = blockCollection.getDoc();

  assertExists(doc.ready, 'Doc is not ready');
  assertExists(doc.root, 'Doc root is not ready');

  const app = document.getElementById('app');
  if (!app) return;

  const editor = new AffineEditorContainer();

  class PatchPageServiceWatcher extends BlockServiceWatcher {
    static override readonly flavour = 'affine:page';

    override mounted() {
      const pageRootService = this.blockService as PageRootService;
      const onFormatBarConnected = pageRootService.specSlots.widgetConnected.on(
        view => {
          if (view.component instanceof AffineFormatBarWidget) {
            configureFormatBar(view.component);
          }
        }
      );
      pageRootService.disposables.add(onFormatBarConnected);
      pageRootService.notificationService =
        mockNotificationService(pageRootService);
      pageRootService.quickSearchService = mockQuickSearchService(collection);
      const switchEditor = editor.switchEditor.bind(editor);
      pageRootService.disposables.add(
        pageRootService.std.get(DocModeProvider).onModeChange(switchEditor)
      );
    }
  }

  const pageSpecs = SpecProvider.getInstance().getSpec('page');
  pageSpecs.extend([PatchPageServiceWatcher]);
  editor.pageSpecs = pageSpecs.value;

  const edgelessSpecs = SpecProvider.getInstance().getSpec('edgeless');
  edgelessSpecs.extend([PatchPageServiceWatcher]);
  editor.edgelessSpecs = edgelessSpecs.value;

  editor.mode = DocMode.Page;
  editor.doc = doc;
  editor.slots.docLinkClicked.on(({ pageId: docId }) => {
    const target = collection.getDoc(docId);
    if (!target) {
      throw new Error(`Failed to jump to doc ${docId}`);
    }
    target.load();
    editor.doc = target;
  });

  app.append(editor);
  await editor.updateComplete;
  const modeService = editor.std.provider.get(DocModeProvider);
  editor.mode = modeService.getMode();
  setDocModeFromUrlParams(modeService);
  editor.slots.docUpdated.on(({ newDocId }) => {
    editor.mode = modeService.getMode(newDocId);
  });

  const outlinePanel = new CustomOutlinePanel();
  outlinePanel.editor = editor;

  const outlineViewer = new CustomOutlineViewer();
  outlineViewer.editor = editor;
  outlineViewer.toggleOutlinePanel = () => {
    outlinePanel.toggleDisplay();
  };

  const framePanel = new CustomFramePanel();
  framePanel.editor = editor;

  const sidePanel = new SidePanel();

  const leftSidePanel = new LeftSidePanel();

  const docsPanel = new DocsPanel();
  docsPanel.editor = editor;

  const commentPanel = new CommentPanel();
  commentPanel.editor = editor;

  const chatPanel = new CustomChatPanel();
  chatPanel.editor = editor;

  const debugMenu = new DebugMenu();
  debugMenu.collection = collection;
  debugMenu.editor = editor;
  debugMenu.outlinePanel = outlinePanel;
  debugMenu.outlineViewer = outlineViewer;
  debugMenu.framePanel = framePanel;
  debugMenu.sidePanel = sidePanel;
  debugMenu.leftSidePanel = leftSidePanel;
  debugMenu.docsPanel = docsPanel;
  debugMenu.commentPanel = commentPanel;
  debugMenu.chatPanel = chatPanel;

  document.body.append(outlinePanel);
  document.body.append(outlineViewer);
  document.body.append(framePanel);
  document.body.append(sidePanel);
  document.body.append(leftSidePanel);
  document.body.append(debugMenu);
  document.body.append(chatPanel);

  // for multiple editor
  const params = new URLSearchParams(location.search);
  const init = params.get('init');
  if (init && init.startsWith('multiple-editor')) {
    app.childNodes.forEach(node => {
      if (node instanceof AffineEditorContainer) {
        node.style.flex = '1';
        if (init === 'multiple-editor-vertical') {
          node.style.overflow = 'auto';
        }
      }
    });
  }

  // debug info
  window.editor = editor;
  window.doc = doc;
  Object.defineProperty(globalThis, 'host', {
    get() {
      return document.querySelector<EditorHost>('editor-host');
    },
  });
  Object.defineProperty(globalThis, 'std', {
    get() {
      return document.querySelector<EditorHost>('editor-host')?.std;
    },
  });

  return editor;
}
