"use client";
import type {NodeProps} from '@xyflow/react';
import {NodeShell} from './NodeShell';
import {useCanvasStore} from '@/store/useCanvasStore';
export default function TextNode({id,selected,data}:NodeProps){const patch=useCanvasStore(s=>s.patchNodeData);return <NodeShell id={id} selected={selected} title="文本" width={320}><textarea className="wx-input min-h-36 resize-y" aria-label="文本内容" placeholder="写下想法、说明或制作笔记…" value={String(data.text??'')} onChange={e=>patch(id,{text:e.target.value})}/></NodeShell>;}
