import * as app from "./app";
/// <reference path="marked-ast/marked.d.ts" />
import * as marked from "marked-ast";

declare var CodeMirror;
declare var uuid;

function replaceAll(str, find, replace) {
    let regex = new RegExp(find.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'g');
    return str.replace(regex, replace);
}

function wrapWithMarkdown(cm, wrapping) {
    cm.operation(() => {
        let from = cm.getCursor("from");
        // if there's something selected wrap it
        if (cm.somethingSelected()) {
            let selected = cm.getSelection();
            let cleaned = replaceAll(selected, wrapping, "");
            if (selected.substring(0, wrapping.length) === wrapping
                && selected.substring(selected.length - wrapping.length) === wrapping) {
                cm.replaceRange(cleaned, from, cm.getCursor("to"));
                cm.setSelection(from, cm.getCursor("from"));
            } else {
                cm.replaceRange(`${wrapping}${cleaned}${wrapping}`, from, cm.getCursor("to"));
                cm.setSelection(from, cm.getCursor("from"));
            }
        } else {
            cm.replaceRange(`${wrapping}${wrapping}`, from);
            let newLocation = { line: from.line, ch: from.ch + wrapping.length };
            cm.setCursor(newLocation);
        }
    })
}

export class RichTextEditor {

    cmInstance;
    marks: any[];
    timeout;
    meta: any;
    onUpdate: (meta: any, content: string) => void;
    getEmbed: (meta: any, query: string) => Element;
    getInlineAttribute: (meta: any, query: string) => string;
    removeInlineAttribute: (meta: any, sourceId: string) => void;

    constructor(node, getEmbed, getInlineAttribute, removeInlineAttribute) {
        this.marks = [];
        this.meta = {};
        this.getEmbed = getEmbed;
        this.getInlineAttribute = getInlineAttribute;
        this.removeInlineAttribute = removeInlineAttribute;
        let cm = this.cmInstance = new CodeMirror(node, {
            lineWrapping: true,
            autoCloseBrackets: true,
            extraKeys: {
                "Cmd-B": (cm) => {
                    wrapWithMarkdown(cm, "**");
                },
                "Cmd-I": (cm) => {
                    wrapWithMarkdown(cm, "_");
                },
            }
        });

        var self = this;
        cm.on("changes", (cm, changes) => {
            self.onChanges(cm, changes);
            if(self.onUpdate) {
                self.onUpdate(self.meta, cm.getValue());
            }
        });
        cm.on("cursorActivity", (cm) => { self.onCursorActivity(cm) });
        cm.on("mousedown", (cm, e) => { self.onMouseDown(cm, e) });
    }

    onChanges(cm, changes) {
        let self = this;
        cm.operation(() => {
            let content = cm.getValue();
            let parts = content.split(/({[^]*?})/gm);
            let ix = 0;
            for (let mark of self.marks) {
                mark.clear();
            }
            self.marks = [];
            let cursorIx = cm.indexFromPos(cm.getCursor("from"));
            for (let part of parts) {
                if (part[0] === "{") {
                    let mark = self.markEmbeddedQuery(cm, part, ix);
                    if (mark) self.marks.push(mark);
                }
                ix += part.length;
            }
        });
    }

    onCursorActivity(cm) {
        if (!cm.somethingSelected()) {
            let cursor = cm.getCursor("from");
            let marks = cm.findMarksAt(cursor);
            for (let mark of marks) {
                if (mark.needsReplacement) {
                    let {from, to} = mark.find();
                    let ix = cm.indexFromPos(from);
                    let text = cm.getRange(from, to);
                    mark.clear();
                    let newMark = this.markEmbeddedQuery(cm, text, ix);
                    if (newMark) this.marks.push(newMark);
                }
            }
        }

        clearTimeout(this.timeout);
        this.timeout = setTimeout(() => {
            if (cm.somethingSelected()) {
                // console.log("TIME TO SHOW!");
            }
        }, 1000);
    }

    onMouseDown(cm, e) {
        let cursor = cm.coordsChar({ left: e.clientX, top: e.clientY });
        let pos = cm.indexFromPos(cursor);
        let marks = cm.findMarksAt(cursor);
        for (let mark of this.marks) {
            if (mark.info && mark.info.to) {
                // console.log("GOTO: ", mark.info.to);
            }
        }
    }

    markEmbeddedQuery(cm, query, ix) {
        let cursorIx = cm.indexFromPos(cm.getCursor("from"));
        let mark;
        let start = cm.posFromIndex(ix);
        let stop = cm.posFromIndex(ix + query.length);
        // as long as our cursor isn't in this span
        if (cursorIx < ix || cursorIx >= ix + query.length) {
            // check if this is a query that's defining an inline attribute
            // e.g. {age: 30}
            if (query.indexOf(":") > -1) {
                let start = cm.posFromIndex(ix);
                let stop = cm.posFromIndex(ix + query.length);
                cm.replaceRange(this.getInlineAttribute(this.meta, query), start, stop);
            } else {
                mark = cm.markText(start, stop, { replacedWith: this.getEmbed(this.meta, query.substring(1, query.length - 1)) });
            }
        } else {
            mark = cm.markText(start, stop, { className: "bold" });
            mark.needsReplacement = true;
        }
        return mark;
    }
}

export function createEditor(getEmbed: (meta: any, query: string) => Element,
                             getInlineAttribute: (meta: any, query: string) => string,
                             removeInlineAttribute: (meta: any, sourceId: string) => void) {
    return function wrapRichTextEditor(node, elem) {
        let editor = node.editor;
        let cm;
        if (!editor) {
            editor = node.editor = new RichTextEditor(node, getEmbed, getInlineAttribute, removeInlineAttribute);
            cm = node.editor.cmInstance;
            cm.focus();
        } else {
            cm = node.editor.cmInstance;
        }
        editor.onUpdate = elem.change;
        editor.meta = elem.meta || editor.meta;
        if (cm.getValue() !== elem.value) {
            cm.setValue(elem.value || "");
        }
        cm.refresh();
    }
}