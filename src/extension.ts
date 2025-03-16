import * as vscode from 'vscode';
import axios from 'axios';

const GOOGLE_API_KEY = 'AIzaSyD2YfdBmH5TYMklO7diC72N3Gy7w4zYzDA';
const GOOGLE_SEARCH_ENGINE_ID = '16318ce58ae09495c';

export function activate(context: vscode.ExtensionContext) {
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
        } catch (error) {
            console.error('Error fetching errors:', error);
            const err = error as Error; // Type assertion to fix TypeScript error
            vscode.window.showErrorMessage(`Error fetching errors: ${err.message}`);
        }
    });

    context.subscriptions.push(disposable);
}

function getProblemsTabErrors(): string[] {
    const allDiagnostics = vscode.languages.getDiagnostics();
    console.log('All diagnostics:', allDiagnostics);

    return allDiagnostics
        .filter(([uri, diagnostics]) => diagnostics.length > 0)
        .flatMap(([uri, diagnostics]) =>
            diagnostics
                .filter(diag => diag.severity === vscode.DiagnosticSeverity.Error)
                .map(diag => `${diag.message} (File: ${uri.fsPath}, Line: ${diag.range.start.line + 1})`)
        );
}

async function searchWebSolutions(errors: string[], language: string): Promise<{ error: string, solutions: { snippet: string, link: string }[] }[]> {
    let results: { error: string, solutions: { snippet: string, link: string }[] }[] = [];
    for (let error of errors) {
        try {
            console.log(`Searching solutions for error: ${error}`);
            const response = await axios.get('https://www.googleapis.com/customsearch/v1', {
                params: {
                    q: `${error} solution in ${language} programming`,
                    key: GOOGLE_API_KEY,
                    cx: GOOGLE_SEARCH_ENGINE_ID
                }
            });
            console.log('Google API Response:', response.data);
            const solutions = response.data.items ? response.data.items.map((item: any) => ({ snippet: item.snippet, link: item.link })) : [];
            results.push({ error, solutions: solutions.length ? solutions : [{ snippet: 'No solutions found', link: '#' }] });
        } catch (axiosError) {
            console.error('Web search error:', axiosError);
            results.push({ error, solutions: [{ snippet: 'Error fetching solutions', link: '#' }] } );
        }
    }
    return results;
}

function showFixesPanel(errors: string[], results: { error: string, solutions: { snippet: string, link: string }[] }[], language: string): void {
    const panel = vscode.window.createWebviewPanel(
        'bugFixes',
        'Bug Fixes',
        vscode.ViewColumn.Beside,
        { enableScripts: true }
    );

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
                                ${results[index].solutions.map(({ snippet, link }, i) => 
                                    `<li><p>${snippet}</p><a href="#" class="solution-link" data-link="${link}">View Full Solution</a></li>`
                                ).join('')}
                            </ul>
                        </details>
                    </div>`;
        }).join('');
    } else {
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

    panel.webview.onDidReceiveMessage(async message => {
        if (message.command === 'openWebView') {
            const webviewPanel = vscode.window.createWebviewPanel(
                'solutionView',
                'Solution View',
                vscode.ViewColumn.One,
                { enableScripts: true }
            );
            try {
                const response = await axios.get(message.url);
                let pageContent = response.data;
                const baseTag = `<base href="${message.url}">`;
                pageContent = pageContent.replace(/<head>/i, `<head>${baseTag}`);
                webviewPanel.webview.html = `<html><body>${pageContent}</body></html>`;
            } catch (error) {
                const err = error as Error; // Fix TypeScript error here as well
                webviewPanel.webview.html = `<html><body><p>Error loading page: ${err.message}</p></body></html>`;
            }
        }
    });
}

export function deactivate() {}
