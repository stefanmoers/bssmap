import {
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual
} from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const SCRYPT_COST = 32768;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;
const SCRYPT_KEY_LENGTH = 64;
const SCRYPT_MAX_MEMORY = 64 * 1024 * 1024;

export const createToken = (bytes = 32) => randomBytes(bytes).toString("base64url");

export const hashToken = (token) => createHash("sha256").update(token).digest("base64url");

export const hashPassword = async (password) => {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, SCRYPT_KEY_LENGTH, {
    N: SCRYPT_COST,
    r: SCRYPT_BLOCK_SIZE,
    p: SCRYPT_PARALLELIZATION,
    maxmem: SCRYPT_MAX_MEMORY
  });
  return [
    "scrypt",
    SCRYPT_COST,
    SCRYPT_BLOCK_SIZE,
    SCRYPT_PARALLELIZATION,
    salt.toString("base64url"),
    key.toString("base64url")
  ].join("$");
};

export const verifyPassword = async (password, encodedHash) => {
  const [algorithm, costValue, blockSizeValue, parallelizationValue, saltValue, hashValue] =
    String(encodedHash).split("$");
  if (algorithm !== "scrypt" || !saltValue || !hashValue) {
    return false;
  }

  const expected = Buffer.from(hashValue, "base64url");
  const actual = await scrypt(password, Buffer.from(saltValue, "base64url"), expected.length, {
    N: Number(costValue),
    r: Number(blockSizeValue),
    p: Number(parallelizationValue),
    maxmem: SCRYPT_MAX_MEMORY
  });
  return expected.length === actual.length && timingSafeEqual(expected, actual);
};
