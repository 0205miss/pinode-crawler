import { Node } from '@stellarbeat/js-stellar-domain';
declare const _default: {
    readFilePromise: (path: string) => Promise<unknown>;
    writeFilePromise: (fileName: string, data: string) => Promise<unknown>;
    getNodesFromFile: (fileName: string) => Promise<Node[]>;
};
export default _default;
