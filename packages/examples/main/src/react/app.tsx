/* --------------------------------------------------------------------------------------------
 * Copyright (c) 2018-2022 TypeFox GmbH (http://www.typefox.io). All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import 'monaco-editor/esm/vs/editor/edcore.main.js';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api.js';

import { buildWorkerDefinition } from 'monaco-editor-workers';

import { initServices, MonacoLanguageClient } from 'monaco-languageclient';
import normalizeUrl from 'normalize-url';
import { toSocket, WebSocketMessageReader, WebSocketMessageWriter } from 'vscode-ws-jsonrpc';
import React, { createRef, useEffect, useMemo, useRef } from 'react';
import { CloseAction, ErrorAction, MessageTransports } from 'vscode-languageclient';

buildWorkerDefinition('../../../node_modules/monaco-editor-workers/dist/workers/', new URL('', window.location.href).href, false);

export function createUrl(hostname: string, port: string, path: string): string {
    const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
    return normalizeUrl(`${protocol}://${hostname}:${port}${path}`);
}

function createWebSocket(url: string) {
    const webSocket = new WebSocket(url);
    webSocket.onopen = () => {
        const socket = toSocket(webSocket);
        const reader = new WebSocketMessageReader(socket);
        const writer = new WebSocketMessageWriter(socket);
        const languageClient = createLanguageClient({
            reader,
            writer
        });
        languageClient.start();
        reader.onClose(() => languageClient.stop());
    };
    return webSocket;
}

function createLanguageClient(transports: MessageTransports): MonacoLanguageClient {
    return new MonacoLanguageClient({
        name: 'Sample Language Client',
        clientOptions: {
            // use a language id as a document selector
            documentSelector: ['json'],
            // disable the default error handler
            errorHandler: {
                error: () => ({ action: ErrorAction.Continue }),
                closed: () => ({ action: CloseAction.DoNotRestart })
            }
        },
        // create a language client connection from the JSON RPC connection on demand
        connectionProvider: {
            get: () => {
                return Promise.resolve(transports);
            }
        }
    });
}

let init = true;

export type EditorProps = {
    defaultCode: string;
    hostname?: string;
    port?: string;
    path?: string;
    className?: string;
}

export const ReactMonacoEditor: React.FC<EditorProps> = ({
    defaultCode,
    hostname = 'localhost',
    path = '/sampleServer',
    port = '3000',
    className
}) => {
    const editorRef = useRef<monaco.editor.IStandaloneCodeEditor>();
    const ref = createRef<HTMLDivElement>();
    const url = useMemo(() => createUrl(hostname, port, path), [hostname, port, path]);
    let lspWebSocket: WebSocket;

    useEffect(() => {
        const currentEditor = editorRef.current;

        if (ref.current != null) {
            const createEditor = () => {
                // register Monaco languages
                monaco.languages.register({
                    id: 'json',
                    extensions: ['.json', '.jsonc'],
                    aliases: ['JSON', 'json'],
                    mimetypes: ['application/json']
                });

                // create Monaco editor
                editorRef.current = monaco.editor.create(ref.current!, {
                    model: monaco.editor.createModel(defaultCode, 'json', monaco.Uri.parse('inmemory://model.json')),
                    glyphMargin: true,
                    lightbulb: {
                        enabled: true
                    },
                    automaticLayout: true
                });

                lspWebSocket = createWebSocket(url);
            };

            if (init) {
                (async () => {
                    await initServices({
                        enableThemeService: true
                    });
                    createEditor();
                    init = false;
                })();
            } else {
                createEditor();
            }

            return () => {
                currentEditor?.dispose();
            };
        }

        window.onbeforeunload = () => {
            // On page reload/exit, close web socket connection
            lspWebSocket?.close();
        };
        return () => {
            // On component unmount, close web socket connection
            lspWebSocket?.close();
        };
    }, []);

    return (
        <div
            ref={ref}
            style={{ height: '50vh' }}
            className={className}
        />
    );
};
