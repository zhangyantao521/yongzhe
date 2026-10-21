#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
碎境勇者 —— 技能名人声「语言包」预生成器
=======================================
用 edge-tts（微软免费神经 TTS，中文极自然）把每个技能名一次性合成成人声语音，
输出到 voice/<名称>.mp3，并打包成 voicepack.js（base64 单文件，部署最省事）。

游戏运行时：vox() 优先播放这些片段，完全离线、必定出声；没生成/没录制的名字
自动回落到内置的离线共振峰合成（机器人腔），所以缺哪个都不影响游戏。

用法
----
    pip install edge-tts
    python gen_voicepack.py
    # 生成后：把 voice/ 文件夹一起部署，或把 voicepack.js 引入 index.html 末尾：
    #   <script src="voicepack.js"></script>

声音可选（改下面 VOICE 即可）：
    男·英雄感  zh-CN-YunyangNeural
    男·沉稳    zh-CN-YunxiNeural
    女·清亮    zh-CN-XiaoxiaoNeural
    女·温柔    zh-CN-XiaoyiNeural
"""
import asyncio
import base64
import json
import os

import edge_tts

VOICE = "zh-CN-YunyangNeural"   # 男声、壮年英雄感，适合喊招
RATE = "+8%"                    # 略快，更有"喊"的劲
VOL = "+12%"                   # 略响

# 与游戏内 NAME_PINYIN 的键一一对应（TTS 直接念中文，无需拼音）
NAMES = [
    "裂空剑", "碎岩斧", "逐风枪",
    "破空三连斩", "回燕斩", "升龙剑", "惊雷刺", "劈山剑", "瞬影斩",
    "十字燕返", "回风斩", "断流横断",
    "万剑归宗",
    "狂蛮冲撞", "旋风斧舞", "裂地波", "崩山冲锋", "天崩地裂", "瞬影砸",
    "横断双挥", "拖斧反斩", "横断山岳",
    "陨石天降",
    "疾风三刺", "回马枪", "出海蛟龙", "惊雷贯穿", "破军扫", "瞬影刺",
    "双横抹月", "侧返枪", "横断江",
    "横扫千军",
    "碎境魔将",
]

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "voice")


async def main():
    os.makedirs(OUT, exist_ok=True)
    pack = {}
    for n in NAMES:
        mp3 = os.path.join(OUT, n + ".mp3")
        try:
            comm = edge_tts.Communicate(text=n, voice=VOICE, rate=RATE, volume=VOL)
            await comm.save(mp3)
            with open(mp3, "rb") as f:
                b64 = base64.b64encode(f.read()).decode("ascii")
            pack[n] = "data:audio/mpeg;base64," + b64
            print("OK  ", n)
        except Exception as e:  # noqa: BLE001
            print("FAIL", n, "->", repr(e))
    with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "voicepack.js"), "w", encoding="utf-8") as f:
        f.write("// 碎境勇者 · 技能名人声语音包（edge-tts 预生成）。在 index.html 末尾引入即可。\n")
        f.write("window.VOICE_PACK = ")
        f.write(json.dumps(pack, ensure_ascii=False))
        f.write(";\n")
    print("wrote voicepack.js with %d clips (of %d names)" % (len(pack), len(NAMES)))


if __name__ == "__main__":
    asyncio.run(main())
