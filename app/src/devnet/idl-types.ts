/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/kvali.json`.
 */
export type Kvali = {
  "address": "2TWg6cMa7bxFa8y7HHoDXZecNJxcbYrUAqwfrg5T8FPK",
  "metadata": {
    "name": "kvali",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Escrowed, volume-verified agricultural spray jobs on Solana"
  },
  "instructions": [
    {
      "name": "acceptJob",
      "docs": [
        "Operator accepts and locks a bond of at least the job amount. The",
        "drone they will fly must hold a valid calibration certificate."
      ],
      "discriminator": [
        43,
        201,
        124,
        1,
        19,
        189,
        96,
        10
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true,
          "relations": [
            "operator"
          ]
        },
        {
          "name": "certificate",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  101,
                  114,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "authority"
              },
              {
                "kind": "account",
                "path": "certificate.drone_hash",
                "account": "certificate"
              }
            ]
          }
        },
        {
          "name": "operator",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  112,
                  101,
                  114,
                  97,
                  116,
                  111,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "authority"
              }
            ]
          }
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "job",
          "writable": true
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "job"
              }
            ]
          }
        },
        {
          "name": "usdcMint"
        },
        {
          "name": "operatorToken",
          "writable": true
        },
        {
          "name": "tokenProgram"
        }
      ],
      "args": [
        {
          "name": "bondAmount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "cancelJob",
      "docs": [
        "Farmer withdraws a job nobody has accepted yet."
      ],
      "discriminator": [
        126,
        241,
        155,
        241,
        50,
        236,
        83,
        118
      ],
      "accounts": [
        {
          "name": "caller",
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "job",
          "writable": true
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "job"
              }
            ]
          }
        },
        {
          "name": "usdcMint"
        },
        {
          "name": "farmerToken",
          "writable": true
        },
        {
          "name": "farmerProfile",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  102,
                  97,
                  114,
                  109,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "job.farmer",
                "account": "job"
              }
            ]
          }
        },
        {
          "name": "operator",
          "docs": [
            "Absent for `cancel_job` (no operator yet)."
          ],
          "writable": true,
          "optional": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  112,
                  101,
                  114,
                  97,
                  116,
                  111,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "job.operator",
                "account": "job"
              }
            ]
          }
        },
        {
          "name": "operatorToken",
          "writable": true,
          "optional": true
        },
        {
          "name": "treasuryToken",
          "writable": true
        },
        {
          "name": "validatorPoolToken",
          "writable": true
        },
        {
          "name": "tokenProgram"
        }
      ],
      "args": []
    },
    {
      "name": "challenge",
      "docs": [
        "Farmer challenges within the window by locking a challenge bond",
        "(20% of the job) and committing to their evidence. Funds freeze until",
        "the field-validator panel rules."
      ],
      "discriminator": [
        16,
        107,
        14,
        39,
        244,
        150,
        81,
        187
      ],
      "accounts": [
        {
          "name": "farmer",
          "signer": true,
          "relations": [
            "job"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "job",
          "writable": true
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "job"
              }
            ]
          }
        },
        {
          "name": "usdcMint"
        },
        {
          "name": "farmerToken",
          "writable": true
        },
        {
          "name": "tokenProgram"
        }
      ],
      "args": [
        {
          "name": "evidenceHash",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "initializeConfig",
      "discriminator": [
        208,
        127,
        21,
        1,
        194,
        190,
        196,
        70
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "program",
          "address": "2TWg6cMa7bxFa8y7HHoDXZecNJxcbYrUAqwfrg5T8FPK"
        },
        {
          "name": "programData"
        },
        {
          "name": "usdcMint"
        },
        {
          "name": "treasury"
        },
        {
          "name": "validatorPool"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "validators",
          "type": {
            "vec": "pubkey"
          }
        },
        {
          "name": "proofThreshold",
          "type": "u8"
        },
        {
          "name": "panelThreshold",
          "type": "u8"
        },
        {
          "name": "challengeWindowSecs",
          "type": "i64"
        }
      ]
    },
    {
      "name": "issueCertificate",
      "docs": [
        "A field validator records a calibration test for one operator + drone",
        "(docs/CALIBRATION.md). Re-running the test renews the certificate,",
        "unless a validator panel has revoked it: a revocation is final for",
        "that operator + drone pair (one validator cannot undo a panel)."
      ],
      "discriminator": [
        61,
        197,
        55,
        28,
        159,
        18,
        132,
        128
      ],
      "accounts": [
        {
          "name": "validator",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "operatorAuthority"
        },
        {
          "name": "certificate",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  101,
                  114,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "operatorAuthority"
              },
              {
                "kind": "arg",
                "path": "droneHash"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "droneHash",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "meterErrorBps",
          "type": "u16"
        },
        {
          "name": "operatorPassed",
          "type": "bool"
        },
        {
          "name": "reportHash",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "validUntil",
          "type": "i64"
        }
      ]
    },
    {
      "name": "migrateConfig",
      "docs": [
        "One-off migration for a Config created before validator staking",
        "existed (372 bytes): grows the account to the current size and sets",
        "the staking defaults (min stake 0 = staking off, 7-day cooldown, 100%",
        "slash). Admin only; the admin pays the extra rent. A no-op on an",
        "already migrated Config. Every other instruction needs the migrated",
        "layout, so run this right after the program upgrade."
      ],
      "discriminator": [
        92,
        131,
        58,
        105,
        210,
        154,
        224,
        193
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "docs": [
            "layout; owner, discriminator, size and admin are checked by hand."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "postJob",
      "docs": [
        "Farmer posts a job and funds the escrow vault with `amount` USDC."
      ],
      "discriminator": [
        34,
        208,
        58,
        248,
        129,
        234,
        179,
        211
      ],
      "accounts": [
        {
          "name": "farmer",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "usdcMint"
        },
        {
          "name": "farmerToken",
          "writable": true
        },
        {
          "name": "farmerProfile",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  102,
                  97,
                  114,
                  109,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "farmer"
              }
            ]
          }
        },
        {
          "name": "job",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  106,
                  111,
                  98
                ]
              },
              {
                "kind": "account",
                "path": "farmer"
              },
              {
                "kind": "arg",
                "path": "jobId"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "job"
              }
            ]
          }
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "jobId",
          "type": "u64"
        },
        {
          "name": "amount",
          "type": "u64"
        },
        {
          "name": "fieldHash",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "chemicalCode",
          "type": "u16"
        },
        {
          "name": "targetRateMlPerHa",
          "type": "u32"
        },
        {
          "name": "toleranceBps",
          "type": "u16"
        },
        {
          "name": "areaCha",
          "type": "u32"
        },
        {
          "name": "sprayDeadline",
          "type": "i64"
        }
      ]
    },
    {
      "name": "reclaimExpired",
      "docs": [
        "Operator accepted but never proved by the spray deadline:",
        "farmer gets the payment back plus the bond. Permissionless."
      ],
      "discriminator": [
        125,
        185,
        48,
        75,
        0,
        71,
        93,
        98
      ],
      "accounts": [
        {
          "name": "caller",
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "job",
          "writable": true
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "job"
              }
            ]
          }
        },
        {
          "name": "usdcMint"
        },
        {
          "name": "farmerToken",
          "writable": true
        },
        {
          "name": "farmerProfile",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  102,
                  97,
                  114,
                  109,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "job.farmer",
                "account": "job"
              }
            ]
          }
        },
        {
          "name": "operator",
          "docs": [
            "Absent for `cancel_job` (no operator yet)."
          ],
          "writable": true,
          "optional": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  112,
                  101,
                  114,
                  97,
                  116,
                  111,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "job.operator",
                "account": "job"
              }
            ]
          }
        },
        {
          "name": "operatorToken",
          "writable": true,
          "optional": true
        },
        {
          "name": "treasuryToken",
          "writable": true
        },
        {
          "name": "validatorPoolToken",
          "writable": true
        },
        {
          "name": "tokenProgram"
        }
      ],
      "args": []
    },
    {
      "name": "registerOperator",
      "discriminator": [
        49,
        242,
        151,
        125,
        212,
        136,
        31,
        89
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "operator",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  112,
                  101,
                  114,
                  97,
                  116,
                  111,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "authority"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "releaseCosign",
      "docs": [
        "Permissionless: once a job is finally settled in the operator's",
        "favour (Released), frees one co-signer's stake lock for it so they",
        "can later withdraw. Jobs lost by the operator release (and slash)",
        "their co-signers inside `resolve_challenge`."
      ],
      "discriminator": [
        92,
        49,
        17,
        91,
        96,
        94,
        138,
        211
      ],
      "accounts": [
        {
          "name": "caller",
          "signer": true
        },
        {
          "name": "job",
          "writable": true
        },
        {
          "name": "stake",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  107,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "stake.validator",
                "account": "validatorStake"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "requestUnstake",
      "docs": [
        "Starts the unstake cooldown. From now on the stake no longer counts",
        "for co-signing; `withdraw_stake` works once the cooldown has passed."
      ],
      "discriminator": [
        44,
        154,
        110,
        253,
        160,
        202,
        54,
        34
      ],
      "accounts": [
        {
          "name": "validator",
          "signer": true,
          "relations": [
            "stake"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "stake",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  107,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "validator"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "resolveChallenge",
      "docs": [
        "The field-validator panel rules on a challenge. At least",
        "`panel_threshold` validators must sign (signer remaining accounts) and",
        "commit to their inspection report. The loser's funds go to the winner.",
        "Validators who are the job's farmer or operator do not count."
      ],
      "discriminator": [
        81,
        191,
        124,
        119,
        131,
        248,
        157,
        109
      ],
      "accounts": [
        {
          "name": "caller",
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "job",
          "writable": true
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "job"
              }
            ]
          }
        },
        {
          "name": "usdcMint"
        },
        {
          "name": "farmerToken",
          "writable": true
        },
        {
          "name": "farmerProfile",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  102,
                  97,
                  114,
                  109,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "job.farmer",
                "account": "job"
              }
            ]
          }
        },
        {
          "name": "operator",
          "docs": [
            "Absent for `cancel_job` (no operator yet)."
          ],
          "writable": true,
          "optional": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  112,
                  101,
                  114,
                  97,
                  116,
                  111,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "job.operator",
                "account": "job"
              }
            ]
          }
        },
        {
          "name": "operatorToken",
          "writable": true,
          "optional": true
        },
        {
          "name": "treasuryToken",
          "writable": true
        },
        {
          "name": "validatorPoolToken",
          "writable": true
        },
        {
          "name": "tokenProgram"
        }
      ],
      "args": [
        {
          "name": "upheld",
          "type": "bool"
        },
        {
          "name": "reportHash",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "revokeCertificate",
      "docs": [
        "A validator panel withdraws a certificate, e.g. after a spot check",
        "shows the drone's meter no longer matches reality.",
        "The certificate's own operator never counts toward the panel."
      ],
      "discriminator": [
        236,
        5,
        130,
        119,
        9,
        164,
        130,
        122
      ],
      "accounts": [
        {
          "name": "caller",
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "certificate",
          "writable": true
        }
      ],
      "args": []
    },
    {
      "name": "setChallengeWindow",
      "docs": [
        "Admin changes the challenge window (60 s ..= 7 days). Applies to",
        "proofs submitted afterwards; open windows keep their deadline."
      ],
      "discriminator": [
        245,
        184,
        111,
        8,
        37,
        209,
        245,
        199
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "challengeWindowSecs",
          "type": "i64"
        }
      ]
    },
    {
      "name": "setStakingParams",
      "docs": [
        "Admin sets the validator staking rules. `min_validator_stake` 0 turns",
        "the stake requirement for co-signing off (the pre-staking behaviour).",
        "`slash_bps` is the share of a co-signer's stake slashed when a panel",
        "rules against the proof (1..=10_000)."
      ],
      "discriminator": [
        10,
        122,
        191,
        49,
        166,
        65,
        71,
        207
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "minValidatorStake",
          "type": "u64"
        },
        {
          "name": "unstakeCooldownSecs",
          "type": "i64"
        },
        {
          "name": "slashBps",
          "type": "u16"
        }
      ]
    },
    {
      "name": "setValidators",
      "docs": [
        "v1 governance: admin replaces the validator set. Move admin to a",
        "multisig before mainnet."
      ],
      "discriminator": [
        159,
        87,
        25,
        94,
        40,
        172,
        118,
        3
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "validators",
          "type": {
            "vec": "pubkey"
          }
        },
        {
          "name": "proofThreshold",
          "type": "u8"
        },
        {
          "name": "panelThreshold",
          "type": "u8"
        }
      ]
    },
    {
      "name": "settle",
      "docs": [
        "Permissionless: once the challenge window closes unchallenged, the",
        "operator receives payment plus their bond back. No approval needed."
      ],
      "discriminator": [
        175,
        42,
        185,
        87,
        144,
        131,
        102,
        212
      ],
      "accounts": [
        {
          "name": "caller",
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "job",
          "writable": true
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "job"
              }
            ]
          }
        },
        {
          "name": "usdcMint"
        },
        {
          "name": "farmerToken",
          "writable": true
        },
        {
          "name": "farmerProfile",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  102,
                  97,
                  114,
                  109,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "job.farmer",
                "account": "job"
              }
            ]
          }
        },
        {
          "name": "operator",
          "docs": [
            "Absent for `cancel_job` (no operator yet)."
          ],
          "writable": true,
          "optional": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  112,
                  101,
                  114,
                  97,
                  116,
                  111,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "job.operator",
                "account": "job"
              }
            ]
          }
        },
        {
          "name": "operatorToken",
          "writable": true,
          "optional": true
        },
        {
          "name": "treasuryToken",
          "writable": true
        },
        {
          "name": "validatorPoolToken",
          "writable": true
        },
        {
          "name": "tokenProgram"
        }
      ],
      "args": []
    },
    {
      "name": "stakeValidator",
      "docs": [
        "A validator locks `amount` USDC in the program's stake vault (adds to",
        "an existing stake). Not allowed once slashed or while unstaking."
      ],
      "discriminator": [
        251,
        16,
        171,
        29,
        214,
        38,
        173,
        210
      ],
      "accounts": [
        {
          "name": "validator",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "stake",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  107,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "validator"
              }
            ]
          }
        },
        {
          "name": "stakeVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  107,
                  101,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "usdcMint"
        },
        {
          "name": "validatorToken",
          "writable": true
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "submitProof",
      "docs": [
        "Operator submits the proof. At least `proof_threshold` data validators",
        "must co-sign (passed as signer remaining accounts). The program itself",
        "re-checks the liters-per-hectare band and coverage. Validators who",
        "are the job's farmer or operator do not count. Must land no later than",
        "the spray deadline (after it, only `reclaim_expired` applies).",
        "",
        "Staking: each co-signer may also pass its ValidatorStake PDA",
        "(writable) in the remaining accounts. If `min_validator_stake` > 0 only",
        "co-signers with an active stake (not slashed, not unstaking, amount ≥",
        "min) count. Every co-signer that presented an active stake is recorded",
        "on the job as slashable and its stake stays locked until the job is",
        "finally settled."
      ],
      "discriminator": [
        54,
        241,
        46,
        84,
        4,
        212,
        46,
        94
      ],
      "accounts": [
        {
          "name": "authority",
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "job",
          "writable": true
        }
      ],
      "args": [
        {
          "name": "proofHash",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "litersMl",
          "type": "u64"
        },
        {
          "name": "areaCoveredCha",
          "type": "u32"
        }
      ]
    },
    {
      "name": "withdrawStake",
      "docs": [
        "Withdraws the whole remaining stake after the cooldown. Blocked while",
        "any proof this stake co-signed is not finally settled (open challenge",
        "window, open challenge, or a settled job whose lock was not yet",
        "released with `release_cosign`)."
      ],
      "discriminator": [
        153,
        8,
        22,
        138,
        105,
        176,
        87,
        66
      ],
      "accounts": [
        {
          "name": "validator",
          "signer": true,
          "relations": [
            "stake"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "stake",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  107,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "validator"
              }
            ]
          }
        },
        {
          "name": "stakeVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  107,
                  101,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "usdcMint"
        },
        {
          "name": "validatorToken",
          "writable": true
        },
        {
          "name": "tokenProgram"
        }
      ],
      "args": []
    }
  ],
  "accounts": [
    {
      "name": "certificate",
      "discriminator": [
        202,
        229,
        222,
        220,
        116,
        20,
        74,
        67
      ]
    },
    {
      "name": "config",
      "discriminator": [
        155,
        12,
        170,
        224,
        30,
        250,
        204,
        130
      ]
    },
    {
      "name": "farmerProfile",
      "discriminator": [
        167,
        109,
        11,
        146,
        241,
        174,
        172,
        255
      ]
    },
    {
      "name": "job",
      "discriminator": [
        75,
        124,
        80,
        203,
        161,
        180,
        202,
        80
      ]
    },
    {
      "name": "operator",
      "discriminator": [
        219,
        31,
        188,
        145,
        69,
        139,
        204,
        117
      ]
    },
    {
      "name": "validatorStake",
      "discriminator": [
        95,
        210,
        178,
        207,
        78,
        5,
        247,
        29
      ]
    }
  ],
  "events": [
    {
      "name": "configMigrated",
      "discriminator": [
        115,
        69,
        99,
        100,
        192,
        77,
        40,
        50
      ]
    },
    {
      "name": "cosignReleased",
      "discriminator": [
        210,
        215,
        152,
        76,
        252,
        234,
        25,
        229
      ]
    },
    {
      "name": "proofCosigned",
      "discriminator": [
        170,
        211,
        154,
        57,
        62,
        87,
        79,
        171
      ]
    },
    {
      "name": "stakeWithdrawn",
      "discriminator": [
        33,
        120,
        159,
        58,
        140,
        255,
        174,
        79
      ]
    },
    {
      "name": "stakingParamsSet",
      "discriminator": [
        63,
        246,
        125,
        115,
        184,
        97,
        220,
        121
      ]
    },
    {
      "name": "unstakeRequested",
      "discriminator": [
        21,
        253,
        177,
        85,
        129,
        206,
        42,
        152
      ]
    },
    {
      "name": "validatorSlashed",
      "discriminator": [
        1,
        160,
        99,
        18,
        25,
        42,
        5,
        213
      ]
    },
    {
      "name": "validatorStaked",
      "discriminator": [
        228,
        142,
        10,
        165,
        53,
        174,
        66,
        86
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "invalidAmount",
      "msg": "Amount must be greater than zero"
    },
    {
      "code": 6001,
      "name": "invalidArea",
      "msg": "Area must be greater than zero"
    },
    {
      "code": 6002,
      "name": "invalidRate",
      "msg": "Invalid target rate or tolerance"
    },
    {
      "code": 6003,
      "name": "invalidDeadline",
      "msg": "Deadline must be in the future"
    },
    {
      "code": 6004,
      "name": "invalidState",
      "msg": "Job is not in the required state"
    },
    {
      "code": 6005,
      "name": "unauthorized",
      "msg": "Signer is not allowed to do this"
    },
    {
      "code": 6006,
      "name": "bondTooSmall",
      "msg": "Bond must be at least the job amount"
    },
    {
      "code": 6007,
      "name": "operatorBusy",
      "msg": "Operator already has an active job"
    },
    {
      "code": 6008,
      "name": "deadlinePassed",
      "msg": "Spray deadline has passed"
    },
    {
      "code": 6009,
      "name": "deadlineNotReached",
      "msg": "Spray deadline has not passed yet"
    },
    {
      "code": 6010,
      "name": "insufficientCoverage",
      "msg": "Covered area is below the minimum"
    },
    {
      "code": 6011,
      "name": "rateOutOfBand",
      "msg": "Applied liters per hectare is outside the tolerance band"
    },
    {
      "code": 6012,
      "name": "windowOpen",
      "msg": "Challenge window is still open"
    },
    {
      "code": 6013,
      "name": "windowClosed",
      "msg": "Challenge window has closed"
    },
    {
      "code": 6014,
      "name": "missingOperatorAccount",
      "msg": "Operator accounts are required for this instruction"
    },
    {
      "code": 6015,
      "name": "notEnoughValidators",
      "msg": "Not enough validators signed"
    },
    {
      "code": 6016,
      "name": "invalidValidatorSet",
      "msg": "Validator set or thresholds are invalid"
    },
    {
      "code": 6017,
      "name": "insufficientFunds",
      "msg": "Vault balance does not cover the fees"
    },
    {
      "code": 6018,
      "name": "notCertified",
      "msg": "Drone and operator need a valid calibration certificate"
    },
    {
      "code": 6019,
      "name": "invalidChallengeWindow",
      "msg": "Challenge window must be between 60 seconds and 7 days"
    },
    {
      "code": 6020,
      "name": "certificateRevoked",
      "msg": "Certificate was revoked by a validator panel and cannot be re-issued"
    },
    {
      "code": 6021,
      "name": "proofAfterDeadline",
      "msg": "Proof submitted after the spray deadline"
    },
    {
      "code": 6022,
      "name": "areaExceedsPosted",
      "msg": "Covered area exceeds 105% of the posted area"
    },
    {
      "code": 6023,
      "name": "operatorIsFarmer",
      "msg": "The job's farmer cannot accept their own job"
    },
    {
      "code": 6024,
      "name": "mathOverflow",
      "msg": "Arithmetic overflow"
    },
    {
      "code": 6025,
      "name": "invalidConfigAccount",
      "msg": "Config account is not a pre-staking Config of this program"
    },
    {
      "code": 6026,
      "name": "invalidStakingParams",
      "msg": "Unstake cooldown must be 60 s - 365 days and slash share 1 - 10000 bps"
    },
    {
      "code": 6027,
      "name": "stakeSlashed",
      "msg": "This validator's stake was slashed; it can no longer stake or co-sign"
    },
    {
      "code": 6028,
      "name": "unstakePending",
      "msg": "Unstaking is in progress; withdraw first"
    },
    {
      "code": 6029,
      "name": "nothingStaked",
      "msg": "Nothing is staked"
    },
    {
      "code": 6030,
      "name": "unstakeAlreadyRequested",
      "msg": "Unstake was already requested"
    },
    {
      "code": 6031,
      "name": "unstakeNotRequested",
      "msg": "Request unstake first"
    },
    {
      "code": 6032,
      "name": "cooldownNotElapsed",
      "msg": "Unstake cooldown has not passed yet"
    },
    {
      "code": 6033,
      "name": "stakeLockedByOpenJobs",
      "msg": "Stake is locked by co-signed proofs that are not finally settled"
    },
    {
      "code": 6034,
      "name": "validatorStakeTooLow",
      "msg": "Not enough co-signers with an active stake of at least the minimum"
    },
    {
      "code": 6035,
      "name": "jobPredatesStaking",
      "msg": "Job was posted before staking and cannot record co-signers; staking is required"
    },
    {
      "code": 6036,
      "name": "stakeAccountNotWritable",
      "msg": "Validator stake account must be writable"
    },
    {
      "code": 6037,
      "name": "invalidStakeAccount",
      "msg": "Account is not this validator's stake PDA"
    },
    {
      "code": 6038,
      "name": "missingStakeAccount",
      "msg": "A staked co-signer's stake account is missing"
    },
    {
      "code": 6039,
      "name": "missingStakeVault",
      "msg": "The stake vault account is missing"
    },
    {
      "code": 6040,
      "name": "nothingToRelease",
      "msg": "No open stake lock for this validator on this job"
    }
  ],
  "types": [
    {
      "name": "certificate",
      "docs": [
        "Calibration certificate for one operator flying one drone."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "operator",
            "type": "pubkey"
          },
          {
            "name": "droneHash",
            "docs": [
              "SHA-256 of the drone serial number."
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "meterErrorBps",
            "docs": [
              "|reported liters − weighed liters| / weighed liters, in basis points."
            ],
            "type": "u16"
          },
          {
            "name": "operatorPassed",
            "docs": [
              "Operator passed the practical part (planning, accuracy, safety)."
            ],
            "type": "bool"
          },
          {
            "name": "reportHash",
            "docs": [
              "SHA-256 of the full test report (cards, photos, weights) on Arweave."
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "issuedBy",
            "type": "pubkey"
          },
          {
            "name": "issuedAt",
            "type": "i64"
          },
          {
            "name": "validUntil",
            "type": "i64"
          },
          {
            "name": "revoked",
            "type": "bool"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "config",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "usdcMint",
            "type": "pubkey"
          },
          {
            "name": "treasury",
            "docs": [
              "USDC token account receiving the 3% Kvali fee."
            ],
            "type": "pubkey"
          },
          {
            "name": "validatorPool",
            "docs": [
              "USDC token account receiving validator fees (v1: a multisig of the",
              "validators, who split it off-chain; v2: on-chain claims)."
            ],
            "type": "pubkey"
          },
          {
            "name": "validators",
            "docs": [
              "v1 permissioned validator set; unused slots are Pubkey::default()."
            ],
            "type": {
              "array": [
                "pubkey",
                7
              ]
            }
          },
          {
            "name": "validatorCount",
            "type": "u8"
          },
          {
            "name": "proofThreshold",
            "docs": [
              "Data validators needed to co-sign a proof."
            ],
            "type": "u8"
          },
          {
            "name": "panelThreshold",
            "docs": [
              "Field validators needed to rule on a challenge."
            ],
            "type": "u8"
          },
          {
            "name": "challengeWindowSecs",
            "docs": [
              "Seconds a passing proof stays open to challenge (D14: 24 h real,",
              "60 s demo). Bounded by MIN/MAX_CHALLENGE_WINDOW_SECS."
            ],
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "minValidatorStake",
            "docs": [
              "Minimum active stake (USDC base units) a validator needs to co-sign a",
              "proof. 0 = no stake required (pre-staking behaviour)."
            ],
            "type": "u64"
          },
          {
            "name": "unstakeCooldownSecs",
            "docs": [
              "Seconds between `request_unstake` and `withdraw_stake` (7 days real,",
              "60 s demo)."
            ],
            "type": "i64"
          },
          {
            "name": "slashBps",
            "docs": [
              "Share of a co-signer's stake slashed when a panel rules against the",
              "proof (basis points, 1..=10_000)."
            ],
            "type": "u16"
          }
        ]
      }
    },
    {
      "name": "configMigrated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "oldLen",
            "type": "u32"
          },
          {
            "name": "newLen",
            "type": "u32"
          }
        ]
      }
    },
    {
      "name": "cosignReleased",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "validator",
            "type": "pubkey"
          },
          {
            "name": "job",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "farmerProfile",
      "docs": [
        "Public record of a farmer's behaviour, so operators can see serial",
        "challengers before accepting."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "jobsPosted",
            "type": "u32"
          },
          {
            "name": "challengesWon",
            "type": "u32"
          },
          {
            "name": "challengesLost",
            "type": "u32"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "job",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "farmer",
            "type": "pubkey"
          },
          {
            "name": "operator",
            "type": "pubkey"
          },
          {
            "name": "jobId",
            "type": "u64"
          },
          {
            "name": "amount",
            "docs": [
              "USDC base units (6 decimals)."
            ],
            "type": "u64"
          },
          {
            "name": "bondAmount",
            "type": "u64"
          },
          {
            "name": "challengeBond",
            "type": "u64"
          },
          {
            "name": "fieldHash",
            "docs": [
              "SHA-256 of the field polygon GeoJSON."
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "chemicalCode",
            "type": "u16"
          },
          {
            "name": "targetRateMlPerHa",
            "type": "u32"
          },
          {
            "name": "toleranceBps",
            "type": "u16"
          },
          {
            "name": "areaCha",
            "docs": [
              "Area in hundredths of a hectare (1 cha = 100 m²)."
            ],
            "type": "u32"
          },
          {
            "name": "droneHash",
            "docs": [
              "SHA-256 of the certified drone's serial number; the proof manifest",
              "must come from this drone."
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "proofHash",
            "docs": [
              "SHA-256 of the Arweave proof manifest."
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "evidenceHash",
            "docs": [
              "SHA-256 of the farmer's challenge evidence."
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "reportHash",
            "docs": [
              "SHA-256 of the validator panel's inspection report."
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "litersMl",
            "type": "u64"
          },
          {
            "name": "areaCoveredCha",
            "type": "u32"
          },
          {
            "name": "state",
            "type": {
              "defined": {
                "name": "jobState"
              }
            }
          },
          {
            "name": "createdAt",
            "type": "i64"
          },
          {
            "name": "sprayDeadline",
            "type": "i64"
          },
          {
            "name": "challengeDeadline",
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "vaultBump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "jobState",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "posted"
          },
          {
            "name": "accepted"
          },
          {
            "name": "proofSubmitted"
          },
          {
            "name": "challenged"
          },
          {
            "name": "released"
          },
          {
            "name": "refunded"
          },
          {
            "name": "cancelled"
          }
        ]
      }
    },
    {
      "name": "operator",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "jobsCompleted",
            "type": "u32"
          },
          {
            "name": "jobsFailed",
            "type": "u32"
          },
          {
            "name": "activeJob",
            "type": {
              "option": "pubkey"
            }
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "proofCosigned",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "validator",
            "type": "pubkey"
          },
          {
            "name": "job",
            "type": "pubkey"
          },
          {
            "name": "stake",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "stakeWithdrawn",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "validator",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "stakingParamsSet",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "minValidatorStake",
            "type": "u64"
          },
          {
            "name": "unstakeCooldownSecs",
            "type": "i64"
          },
          {
            "name": "slashBps",
            "type": "u16"
          }
        ]
      }
    },
    {
      "name": "unstakeRequested",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "validator",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "availableAt",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "validatorSlashed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "validator",
            "type": "pubkey"
          },
          {
            "name": "job",
            "type": "pubkey"
          },
          {
            "name": "farmer",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "remaining",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "validatorStake",
      "docs": [
        "A validator's USDC stake, held in the program's stake vault",
        "(`[\"stake_vault\"]`, owned by the Config PDA)."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "validator",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "docs": [
              "USDC base units currently staked (after any slashing)."
            ],
            "type": "u64"
          },
          {
            "name": "unstakeRequestedAt",
            "docs": [
              "0 = not unstaking; otherwise when `request_unstake` was called."
            ],
            "type": "i64"
          },
          {
            "name": "slashed",
            "docs": [
              "Set by a panel ruling against a proof this validator co-signed. A",
              "slashed stake never counts for co-signing again."
            ],
            "type": "bool"
          },
          {
            "name": "openCosigns",
            "docs": [
              "Co-signed proofs not yet finally settled; withdrawal needs 0."
            ],
            "type": "u16"
          },
          {
            "name": "proofsCosigned",
            "type": "u32"
          },
          {
            "name": "timesSlashed",
            "type": "u32"
          },
          {
            "name": "totalStaked",
            "docs": [
              "Lifetime deposits and lifetime slashed amount (USDC base units)."
            ],
            "type": "u64"
          },
          {
            "name": "totalSlashed",
            "type": "u64"
          },
          {
            "name": "createdAt",
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "validatorStaked",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "validator",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "total",
            "type": "u64"
          }
        ]
      }
    }
  ]
};
