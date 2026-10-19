"use client";
import type {NodeProps} from '@xyflow/react';
import {NodeShell} from './NodeShell';
import DirectorChat from '../canvas/DirectorChat';
export default function DirectorNode({id,selected}:NodeProps){return <NodeShell id={id} selected={selected} title="导演台" width={380}><DirectorChat id={id}/></NodeShell>;}
