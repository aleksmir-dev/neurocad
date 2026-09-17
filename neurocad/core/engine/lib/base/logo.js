// app/core/engine/lib/base/logo.js

export class Logo {
    constructor(text) {
        this.text = text || '⚡ Ассистент';
    }

    render() {
        return `<div class="core-engine-lib-base-logo">${this.text}</div>`;
    }
}