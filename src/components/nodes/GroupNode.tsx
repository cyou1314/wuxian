"use client";
import type {NodeProps} from '@xyflow/react';
import {useCanvasStore} from '@/store/useCanvasStore';
export default function GroupNode({id,selected}:NodeProps){const n=useCanvasStore(s=>s.graph.nodes.find(n=>n.id===id));return <div className={`wx-group ${selected?'selected':''}`} style={{width:n?.width??400,height:n?.height??300}}><strong>{n?.label??'分组'}</strong></div>;}
