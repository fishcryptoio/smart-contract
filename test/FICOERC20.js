const { expect } = require("chai");
const { ethers } = require("hardhat");
const { fromRpcSig } = require("ethereumjs-util");
const ethSigUtil = require("eth-sig-util");
const Wallet = require("ethereumjs-wallet").default;

const { keccak256, toUtf8Bytes, defaultAbiCoder } = ethers.utils;
const { MaxUint256 } = ethers.constants;

function expandTo18Decimals(n) {
    return new ethers.BigNumber.from(n).mul(
        new ethers.BigNumber.from(10).pow(18)
    );
}

const EIP712Domain = [
    { name: "name", type: "string" },
    { name: "version", type: "string" },
    { name: "chainId", type: "uint256" },
    { name: "verifyingContract", type: "address" },
];

const Permit = [
    { name: "owner", type: "address" },
    { name: "spender", type: "address" },
    { name: "value", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
];

function getDomainSeparator(name, tokenAddress) {
    return keccak256(
        defaultAbiCoder.encode(
            ["bytes32", "bytes32", "bytes32", "uint256", "address"],
            [
                keccak256(
                    toUtf8Bytes(
                        "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
                    )
                ),
                keccak256(toUtf8Bytes(name)),
                keccak256(toUtf8Bytes("1")),
                1,
                tokenAddress,
            ]
        )
    );
}

const TOTAL_SUPPLY = expandTo18Decimals(1_000_000_000);
const TEST_AMOUNT = expandTo18Decimals(10);

describe("FICOERC20", function () {
    let token, ficoERC20, owner, other, wallet, address, nonce, name;

    const chainId = 1337;
    const maxDeadline = MaxUint256;
    const buildData = (chainId, verifyingContract, deadline = maxDeadline) => ({
        primaryType: "Permit",
        types: { EIP712Domain, Permit },
        domain: { name, version: "1", chainId, verifyingContract },
        message: {
            owner: address,
            spender: other.address,
            value: TEST_AMOUNT.toString(),
            nonce: nonce.toString(),
            deadline: deadline.toString(),
        },
    })

    beforeEach(async () => {
        [owner, other] = await ethers.getSigners();
        const FICOERC20 = await ethers.getContractFactory("FICOERC20", owner);
        ficoERC20 = await FICOERC20.deploy();
        token = await ficoERC20.deployed();
        name = await token.name();
        wallet = Wallet.generate();
        address = wallet.getAddressString();
        nonce = await token.nonces(address);
    });

    it("name, symbol, decimals, totalSupply, balanceOf, DOMAIN_SEPARATOR, PERMIT_TYPEHASH", async () => {
        const name = await token.name();
        expect(name).to.eq("FishCrypto Token");
        expect(await token.symbol()).to.eq("FICO");
        expect(await token.decimals()).to.eq(18);
        expect(await token.totalSupply()).to.eq(TOTAL_SUPPLY);
        expect(await token.balanceOf(owner.address)).to.eq(TOTAL_SUPPLY);
        expect(await token.PERMIT_TYPEHASH()).to.eq(
            keccak256(
                toUtf8Bytes(
                    "Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"
                )
            )
        );
        expect(await token.DOMAIN_SEPARATOR()).to.eq(
            keccak256(
                defaultAbiCoder.encode(
                    ["bytes32", "bytes32", "bytes32", "uint256", "address"],
                    [
                        keccak256(
                            toUtf8Bytes(
                                "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
                            )
                        ),
                        keccak256(toUtf8Bytes(name)),
                        keccak256(toUtf8Bytes("1")),
                        1337,
                        token.address,
                    ]
                )
            )
        );
    });
    it("approve", async () => {
        await expect(token.approve(other.address, TEST_AMOUNT))
            .to.emit(token, "Approval")
            .withArgs(owner.address, other.address, TEST_AMOUNT);
        expect(await token.allowance(owner.address, other.address)).to.eq(
            TEST_AMOUNT
        );
    });
    it("transfer", async () => {
        await expect(token.transfer(other.address, TEST_AMOUNT))
            .to.emit(token, "Transfer")
            .withArgs(owner.address, other.address, TEST_AMOUNT);
        expect(await token.balanceOf(owner.address)).to.eq(
            TOTAL_SUPPLY.sub(TEST_AMOUNT)
        );
        expect(await token.balanceOf(other.address)).to.eq(TEST_AMOUNT);
    });
    it("transfer:fail", async () => {
        await expect(token.transfer(other.address, TOTAL_SUPPLY.add(1))).to.be
            .reverted; // ds-math-sub-underflow
        await expect(token.connect(other).transfer(owner.address, 1)).to.be
            .reverted; // ds-math-sub-underflow
    });
    it("transferFrom", async () => {
        await token.approve(other.address, TEST_AMOUNT);
        await expect(
            token
                .connect(other)
                .transferFrom(owner.address, other.address, TEST_AMOUNT)
        )
            .to.emit(token, "Transfer")
            .withArgs(owner.address, other.address, TEST_AMOUNT);
        expect(await token.allowance(owner.address, other.address)).to.eq(0);
        expect(await token.balanceOf(owner.address)).to.eq(
            TOTAL_SUPPLY.sub(TEST_AMOUNT)
        );
        expect(await token.balanceOf(other.address)).to.eq(TEST_AMOUNT);
    });
    it("transferFrom:max", async () => {
        await token.approve(other.address, MaxUint256);
        await expect(
            token
                .connect(other)
                .transferFrom(owner.address, other.address, TEST_AMOUNT)
        )
            .to.emit(token, "Transfer")
            .withArgs(owner.address, other.address, TEST_AMOUNT);
        expect(await token.allowance(owner.address, other.address)).to.eq(
            MaxUint256
        );
        expect(await token.balanceOf(owner.address)).to.eq(
            TOTAL_SUPPLY.sub(TEST_AMOUNT)
        );
        expect(await token.balanceOf(other.address)).to.eq(TEST_AMOUNT);
    });
    it("permit", async () => {
        const data = buildData(chainId, token.address);
        const signature = ethSigUtil.signTypedMessage(wallet.getPrivateKey(), {
            data,
        });

        const { v, r, s } = fromRpcSig(signature);

        const receipt = await token.permit(
            address,
            other.address,
            TEST_AMOUNT,
            maxDeadline,
            v,
            r,
            s
        );

        expect(await token.nonces(address)).to.be.eq(ethers.BigNumber.from(1));
        expect(await token.allowance(address, other.address)).to.be.eq(
            ethers.BigNumber.from(TEST_AMOUNT)
        );
    });
    it('rejects reused signature', async function () {
        const data = buildData(chainId, token.address);
        const signature = ethSigUtil.signTypedMessage(wallet.getPrivateKey(), { data });
        const { v, r, s } = fromRpcSig(signature);

        await token.permit(address, other.address, TEST_AMOUNT, maxDeadline, v, r, s);
        await expect(token.permit(address, other.address, TEST_AMOUNT, maxDeadline, v, r, s)).to.be.revertedWith('FICO: INVALID_SIGNATURE')
    });
    it('rejects other signature', async function () {
        const otherWallet = Wallet.generate();
        const data = buildData(chainId, token.address);
        const signature = ethSigUtil.signTypedMessage(otherWallet.getPrivateKey(), { data });
        const { v, r, s } = fromRpcSig(signature);

        await expect(token.permit(address, other.address, TEST_AMOUNT, maxDeadline, v, r, s)).to.be.revertedWith('FICO: INVALID_SIGNATURE')
    });
    it('rejects expired permit', async function () {
        const deadline = 1634810000
        const data = buildData(chainId, token.address, deadline);
        const signature = ethSigUtil.signTypedMessage(wallet.getPrivateKey(), { data });
        const { v, r, s } = fromRpcSig(signature);

        await expect(token.permit(address, other.address, TEST_AMOUNT, deadline, v, r, s)).to.be.revertedWith('FICO: EXPIRED')
    });
    it("burn", async () => {
        const amount = expandTo18Decimals(10)
        expect(await token.burn(amount)).to.emit(token, 'Transfer').withArgs(owner.address, ethers.constants.AddressZero, amount)
        expect(await token.totalSupply()).to.be.eq(expandTo18Decimals(999_999_990))
    })
    it("burn:overAmount", async () => {
        await expect(token.burn(expandTo18Decimals(1_000_000_001))).to.be.revertedWith('ERC20: burn amount exceeds balance')
    })
    it("burn:withoutOwner", async () => {
        await expect(token.connect(other).burn(expandTo18Decimals(1_000_000_001))).to.be.revertedWith('Ownable: caller is not the owner')
    })
});
