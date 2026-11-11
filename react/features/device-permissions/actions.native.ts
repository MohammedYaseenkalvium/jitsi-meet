/**
 * The permission prompt is explained only on web.
 *
 * @returns {Function}
 */
export function explainBeforePrompt(..._args: any[]) {
    return () => Promise.resolve(true);
}
