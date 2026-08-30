#!/usr/bin/env python3
"""六道大地图编辑器 · 本地静态服务器

把 CHessGAme 作为静态根目录启动，使地图编辑器与贴图资源都能被访问：

    python serve.py           # -> http://localhost:5173/map-editor/
    python serve.py 8080      # 自定义端口

说明：本脚本仅用于本地预览编辑。若要让「写入 configs/overworld.json」按钮
真正写盘，请改用游戏主服务（python main.py），并提供 /api/overworld/save。
"""
import functools
import http.server
import os
import socketserver
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)  # CHessGAme
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 5173


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, fmt, *args):  # 精简日志
        sys.stderr.write("[map-editor] %s\n" % (fmt % args))


if __name__ == "__main__":
    handler = functools.partial(QuietHandler, directory=ROOT)
    with socketserver.TCPServer(("", PORT), handler) as httpd:
        print(f"六道大地图编辑器就绪: http://localhost:{PORT}/map-editor/")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n已停止")