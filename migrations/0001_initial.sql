-- スキーマ + 初期データ（nowJSONStructure.md 相当: カテゴリ5・ブックマーク29）
-- 適用: npm run db:migrate:local / db:migrate:remote

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS bookmarks (
  id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_categories_sort_order ON categories(sort_order);
CREATE INDEX IF NOT EXISTS idx_bookmarks_category_sort_order ON bookmarks(category_id, sort_order);

INSERT INTO categories (id, name, sort_order) VALUES
  ('category_tools', '便利ツール', 10),
  ('category_coding', 'コーディングテク', 20),
  ('category_design', 'デザイン参考', 30),
  ('category_interest', '興味', 40),
  ('category_mcp', 'MCPサーバ', 50);

INSERT INTO bookmarks (id, category_id, name, url, sort_order) VALUES
  -- 便利ツール
  ('bookmark_001', 'category_tools', 'Markdown2PDF', 'https://ichiken26.github.io/markdownConvertToPDF/', 10),
  ('bookmark_002', 'category_tools', '色チェッカー', 'https://ichiken26.github.io/colour-checker/', 20),
  ('bookmark_003', 'category_tools', '読了時間シミュレーター', 'https://ichiken26.github.io/reading_count/', 30),
  -- コーディングテク
  ('bookmark_004', 'category_coding', 'letではなくconstを', 'https://qiita.com/kiyoshiro/items/13c60fad1f5279993fa2', 10),
  ('bookmark_005', 'category_coding', 'letがなぜだめか', 'https://qiita.com/kiyoshiro/items/2910495c3bee8c4ecc21', 20),
  ('bookmark_006', 'category_coding', 'プリンシプルオブプログラミング', 'https://qiita.com/k12da/items/c2d9d15cdbe1d0333a6b', 30),
  ('bookmark_007', 'category_coding', 'DRY / SOLID', 'https://zenn.dev/manase/scraps/40eebd83bf2756', 40),
  ('bookmark_008', 'category_coding', 'SOLID / KISS / YAGNI / DRY', 'https://qiita.com/wataru-nakamura6/items/387d99751bcf3b9e3cf6', 50),
  ('bookmark_009', 'category_coding', 'lodashのやめ方', 'https://qiita.com/mizchi/items/af17f45d5653b76f6751', 60),
  ('bookmark_010', 'category_coding', 'lodashの便利な使い方', 'https://qiita.com/waterada/items/986660d31bc107dbd91c6', 70),
  ('bookmark_011', 'category_coding', 'gitのコミットの取り消し関連', 'https://qiita.com/shuntaro_tamura/items/06281261d893acf049ed', 80),
  ('bookmark_012', 'category_coding', 'git stash', 'https://qiita.com/chihiro/items/f373873d5c2dfbd03250', 90),
  ('bookmark_013', 'category_coding', 'git config', 'https://qiita.com/shionit/items/fb4a1a30538f8d335b35', 100),
  ('bookmark_014', 'category_coding', 'package.jsonとpackage-lock.json', 'https://qiita.com/phoby20/items/ca17d96bbf0da0b9989e', 110),
  ('bookmark_015', 'category_coding', 'portの空きを確認しふさがっていたらkill', 'https://qiita.com/mom0tomo/items/ce9a9bc536bba3709f91', 120),
  -- デザイン参考
  ('bookmark_016', 'category_design', 'ダ鳥獣戯画', 'https://chojugiga.com/', 10),
  ('bookmark_017', 'category_design', 'Dribbble', 'https://dribbble.com/', 20),
  ('bookmark_018', 'category_design', 'Behance', 'https://www.behance.net/', 30),
  ('bookmark_019', 'category_design', 'Pinterest', 'https://www.pinterest.com/', 40),
  ('bookmark_020', 'category_design', 'Mobbin', 'https://mobbin.com/', 50),
  ('bookmark_021', 'category_design', 'Land-book', 'https://land-book.com/', 60),
  ('bookmark_022', 'category_design', 'One Page Love', 'https://onepagelove.com/', 70),
  -- 興味
  ('bookmark_023', 'category_interest', 'Cursor Browser Automation', 'https://zenn.dev/nix/articles/8751bf909737e2', 10),
  ('bookmark_024', 'category_interest', 'ブラウザ比較', 'https://qiita.com/ico_apptest/items/71fd6105993bcf0b219a', 20),
  ('bookmark_025', 'category_interest', 'Blender講座', 'https://gamemakers.jp/tag/blender-tutorial/', 30),
  ('bookmark_026', 'category_interest', 'Unity 2Dキャラ', 'https://zenn.dev/sumeragi_0258/articles/74232366da9673', 40),
  -- MCPサーバ
  ('bookmark_027', 'category_mcp', 'MCPとは？', 'https://zenn.dev/cloud_ace/articles/model-context-protocol', 10),
  ('bookmark_028', 'category_mcp', 'MCPの概要と導入方法', 'https://zenn.dev/takna/articles/mcp-server-tutorial-01-install', 20),
  ('bookmark_029', 'category_mcp', 'Backlog MCPサーバ', 'https://careers.nulab.com/nulaber/released-backlog-mcp-server/', 30);
