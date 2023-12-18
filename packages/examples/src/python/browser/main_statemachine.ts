/* --------------------------------------------------------------------------------------------
 * Copyright (c) 2018-2022 TypeFox GmbH (http://www.typefox.io). All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import { editor } from 'monaco-editor';
import { MonacoLanguageClient, initServices, useOpenEditorStub } from 'monaco-languageclient';
import { BrowserMessageReader, BrowserMessageWriter } from 'vscode-languageserver-protocol/browser.js';
import { CloseAction, ErrorAction, MessageTransports } from 'vscode-languageclient';
import { createConfiguredEditor } from 'vscode/monaco';
import { ExtensionHostKind, registerExtension } from 'vscode/extensions';
import getConfigurationServiceOverride, { updateUserConfiguration } from '@codingame/monaco-vscode-configuration-service-override';
import getEditorServiceOverride from '@codingame/monaco-vscode-editor-service-override';
import getKeybindingsServiceOverride from '@codingame/monaco-vscode-keybindings-service-override';
import getThemeServiceOverride from '@codingame/monaco-vscode-theme-service-override';
import getTextmateServiceOverride from '@codingame/monaco-vscode-textmate-service-override';
import { LogLevel } from 'vscode/services';
import '@codingame/monaco-vscode-theme-defaults-default-extension';
import { whenReady } from '@codingame/monaco-vscode-python-default-extension';
import { Uri } from 'vscode';

import { buildWorkerDefinition } from 'monaco-editor-workers';
buildWorkerDefinition('../../node_modules/monaco-editor-workers/dist/workers/', new URL('', window.location.href).href, false);

const languageId = 'python';

export const setupPythonClient = async () => {
    const serviceConfig = {
        userServices: {
            ...getThemeServiceOverride(),
            ...getTextmateServiceOverride(),
            ...getConfigurationServiceOverride(Uri.file('/workspace')),
            ...getEditorServiceOverride(useOpenEditorStub),
            ...getKeybindingsServiceOverride()
        },
        debugLogging: true,
        logLevel: LogLevel.Info
    };
    await initServices(serviceConfig);

    await whenReady();

    console.log('Setting up Python client configuration ...');
    const extension = {
        name: 'python-client',
        publisher: 'monaco-languageclient-project',
        version: '1.0.0',
        engines: {
            vscode: '*'
        },
        contributes: {
            languages: [{
                id: languageId,
                extensions: [
                    '.py',
                    '.pyi'
                ],
                aliases: [
                    'Python'
                ]
            }],
            keybindings: [{
                key: 'ctrl+p',
                command: 'editor.action.quickCommand',
                when: 'editorTextFocus'
            }, {
                key: 'ctrl+shift+c',
                command: 'editor.action.commentLine',
                when: 'editorTextFocus'
            }]
        }
    };
    registerExtension(extension, ExtensionHostKind.LocalProcess);

    updateUserConfiguration(`{
        "editor.fontSize": 14,
        "workbench.colorTheme": "Default Dark Modern"
    }`);

    const examplePythonUrl = new URL('./src/python/browser/example.py', window.location.href).href;
    const editorText = await (await fetch(examplePythonUrl)).text();

    const editorOptions = {
        model: editor.createModel(editorText, languageId, Uri.parse('/workspace/example.python')),
        automaticLayout: true
    };
    createConfiguredEditor(document.getElementById('container')!, editorOptions);

    function createLanguageClient(transports: MessageTransports): MonacoLanguageClient {
        return new MonacoLanguageClient({
            name: 'Python Client',
            clientOptions: {
                // use a language id as a document selector
                documentSelector: [languageId],
                // disable the default error handler
                errorHandler: {
                    error: () => ({ action: ErrorAction.Continue }),
                    closed: () => ({ action: CloseAction.DoNotRestart })
                }
            },
            // create a language client connection to the server running in the web worker
            connectionProvider: {
                get: () => {
                    return Promise.resolve(transports);
                }
            }
        });
    }

    const pythonWorkerUrl = new URL('../../node_modules/@typefox/pyright-browser/dist/pyright.worker.js', window.location.href).href;
    const worker = new Worker(pythonWorkerUrl);
    worker.postMessage({
        type: 'browser/boot',
        mode: 'foreground'
    });
    const reader = new BrowserMessageReader(worker);
    const writer = new BrowserMessageWriter(worker);
    const languageClient = createLanguageClient({ reader, writer });
    languageClient.start();
    reader.onClose(() => languageClient.stop());
};

export const startPythonClient = async () => {
    try {
        await setupPythonClient();
    } catch (e) {
        console.error(e);
    }
};
