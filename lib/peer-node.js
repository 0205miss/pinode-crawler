"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PeerNode = void 0;
class PeerNode {
    constructor(publicKey) {
        this.isValidating = false;
        this.isValidatingIncorrectValues = false;
        this.overLoaded = false;
        this.suppliedPeerList = false;
        this.publicKey = publicKey;
    }
    get key() {
        return this.ip + ':' + this.port;
    }
    get participatingInSCP() {
        return this.latestActiveSlotIndex !== undefined;
    }
    get successfullyConnected() {
        return this.ip !== undefined;
    }
}
exports.PeerNode = PeerNode;
//# sourceMappingURL=peer-node.js.map