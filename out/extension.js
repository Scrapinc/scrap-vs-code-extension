"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const axios_1 = __importDefault(require("axios"));
const GOOGLE_API_KEY = 'AIzaSyD2YfdBmH5TYMklO7diC72N3Gy7w4zYzDA';
const GOOGLE_SEARCH_ENGINE_ID = '16318ce58ae09495c';
function activate(context) {
    console.log('ScrapFixes extension is now active!');
    let disposable = vscode.commands.registerCommand('scrapfixes.detectBugs', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor || !editor.document) {
            vscode.window.showErrorMessage('No active file open. Please open a file and try again.');
            return;
        }
        const document = editor.document;
        const language = document.languageId;
        console.log(`Analyzing code in language: ${language}`);
        vscode.window.showInformationMessage(`Analyzing code in detected language: ${language}`);
        try {
            const terminalErrors = getProblemsTabErrors();
            console.log('Fetched terminal errors:', terminalErrors);
            if (terminalErrors.length === 0) {
                vscode.window.showInformationMessage('No errors detected in the Problems panel.');
                return;
            }
            let webSolutions = await searchWebSolutions(terminalErrors, language);
            showFixesPanel(terminalErrors, webSolutions, language);
        }
        catch (error) {
            console.error('Error fetching errors:', error);
            const err = error; // Type assertion to fix TypeScript error
            vscode.window.showErrorMessage(`Error fetching errors: ${err.message}`);
        }
    });
    context.subscriptions.push(disposable);
}
function getProblemsTabErrors() {
    const allDiagnostics = vscode.languages.getDiagnostics();
    console.log('All diagnostics:', allDiagnostics);
    return allDiagnostics
        .filter(([uri, diagnostics]) => diagnostics.length > 0)
        .flatMap(([uri, diagnostics]) => diagnostics
        .filter(diag => diag.severity === vscode.DiagnosticSeverity.Error)
        .map(diag => `${diag.message} (File: ${uri.fsPath}, Line: ${diag.range.start.line + 1})`));
}
async function searchWebSolutions(errors, language) {
    let results = [];
    for (let error of errors) {
        try {
            console.log(`Searching solutions for error: ${error}`);
            const response = await axios_1.default.get('https://www.googleapis.com/customsearch/v1', {
                params: {
                    q: `${error} solution in ${language} programming`,
                    key: GOOGLE_API_KEY,
                    cx: GOOGLE_SEARCH_ENGINE_ID
                }
            });
            console.log('Google API Response:', response.data);
            const solutions = response.data.items ? response.data.items.map((item) => ({ snippet: item.snippet, link: item.link })) : [];
            results.push({ error, solutions: solutions.length ? solutions : [{ snippet: 'No solutions found', link: '#' }] });
        }
        catch (axiosError) {
            console.error('Web search error:', axiosError);
            results.push({ error, solutions: [{ snippet: 'Error fetching solutions', link: '#' }] });
        }
    }
    return results;
}
function showFixesPanel(errors, results, language) {
    const panel = vscode.window.createWebviewPanel('bugFixes', 'Bug Fixes', vscode.ViewColumn.Beside, { enableScripts: true });
    let content = `<h2>Detected Errors and Possible Fixes</h2>`;
    content += `<p><b>Detected Language:</b> ${language}</p>`;
    content += `<p><b>Total Errors Detected:</b> ${errors.length}</p>`;
    if (errors.length > 0) {
        content += errors.map((error, index) => {
            return `<div>
                        <p><b>Error ${index + 1}:</b> <code>${error}</code></p>
                        <details>
                            <summary>Possible Fixes</summary>
                            <ul>
                                ${results[index].solutions.map(({ snippet, link }, i) => `<li><p>${snippet}</p><a href="#" class="solution-link" data-link="${link}">View Full Solution</a></li>`).join('')}
                            </ul>
                        </details>
                    </div>`;
        }).join('');
    }
    else {
        content += '<p>No solutions found online.</p>';
    }
    panel.webview.html = `<html>
    <body>
        ${content}
        <script>
            const vscode = acquireVsCodeApi();
            document.querySelectorAll('.solution-link').forEach(anchor => {
                anchor.addEventListener('click', event => {
                    event.preventDefault();
                    const url = event.target.getAttribute('data-link');
                    if (url && url.startsWith('http')) {
                        vscode.postMessage({ command: 'openWebView', url });
                    } else {
                        vscode.postMessage({ command: 'error', message: 'Invalid URL' });
                    }
                });
            });
        </script>
    </body>
    </html>`;
    panel.webview.onDidReceiveMessage(async (message) => {
        if (message.command === 'openWebView') {
            const webviewPanel = vscode.window.createWebviewPanel('solutionView', 'Solution View', vscode.ViewColumn.One, { enableScripts: true });
            try {
                const response = await axios_1.default.get(message.url);
                let pageContent = response.data;
                const baseTag = `<base href="${message.url}">`;
                pageContent = pageContent.replace(/<head>/i, `<head>${baseTag}`);
                webviewPanel.webview.html = `<html><body>${pageContent}</body></html>`;
            }
            catch (error) {
                const err = error; // Fix TypeScript error here as well
                webviewPanel.webview.html = `<html><body><p>Error loading page: ${err.message}</p></body></html>`;
            }
        }
    });
}
function deactivate() { }
//# sourceMappingURL=extension.js.map