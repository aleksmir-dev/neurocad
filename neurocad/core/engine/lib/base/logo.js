// app/core/engine/lib/base/logo.js

export class Logo {
    constructor(text) {
        this.text = text || '⚡ Ассистент';
        this.href = '/';
    }

    render() {
        return `<a class="core-engine-lib-base-logo" href="${this.href}">${this.text}</a>`;
    }
}